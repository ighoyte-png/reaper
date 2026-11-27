-- Enterprise accounts: owners, invites, platform operators, audit, billing hooks.

-- ---------------------------------------------------------------------------
-- Organization owner
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null;

alter table public.organization_memberships
  add column if not exists is_owner boolean not null default false;

create index if not exists organizations_owner_user_idx
  on public.organizations (owner_user_id);

-- Backfill: first admin membership (or any membership) becomes owner.
update public.organization_memberships m
set is_owner = true
where m.ctid in (
  select distinct on (organization_id) ctid
  from public.organization_memberships
  order by organization_id,
    case when role = 'admin' then 0 else 1 end,
    created_at
);

update public.organizations o
set owner_user_id = m.user_id
from public.organization_memberships m
where m.organization_id = o.id
  and m.is_owner = true
  and o.owner_user_id is null;

-- ---------------------------------------------------------------------------
-- Pending invites
-- ---------------------------------------------------------------------------
create table if not exists public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role public.app_role not null default 'member',
  full_name text,
  person_id uuid references public.people(id) on delete set null,
  invited_by uuid references auth.users(id) on delete set null,
  token_hash text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint organization_invites_email_lower check (email = lower(email))
);

create index if not exists organization_invites_org_idx
  on public.organization_invites (organization_id)
  where revoked_at is null and accepted_at is null;

create unique index if not exists organization_invites_token_hash_uidx
  on public.organization_invites (token_hash);

create unique index if not exists organization_invites_pending_email_uidx
  on public.organization_invites (organization_id, email)
  where revoked_at is null and accepted_at is null;

alter table public.organization_invites enable row level security;

drop policy if exists organization_invites_select_org on public.organization_invites;
create policy organization_invites_select_org
  on public.organization_invites for select
  to authenticated
  using (
    organization_id = public.current_org_id()
    and public.current_role() in ('admin', 'manager')
  );

-- Writes via service role / security definer only.

-- ---------------------------------------------------------------------------
-- Platform operators + audit
-- ---------------------------------------------------------------------------
create table if not exists public.platform_operators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint platform_operators_email_lower check (email = lower(email))
);

create unique index if not exists platform_operators_email_uidx
  on public.platform_operators (email);

alter table public.platform_operators enable row level security;
-- No authenticated policies — service role only.

create table if not exists public.platform_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,
  organization_id uuid references public.organizations(id) on delete set null,
  target_type text,
  target_id text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_audit_log_created_idx
  on public.platform_audit_log (created_at desc);

create index if not exists platform_audit_log_org_idx
  on public.platform_audit_log (organization_id, created_at desc);

alter table public.platform_audit_log enable row level security;
-- Service role only.

-- ---------------------------------------------------------------------------
-- Billing hooks (no live Stripe checkout)
-- ---------------------------------------------------------------------------
create table if not exists public.billing_accounts (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan_key text not null default 'free',
  status text not null default 'none'
    check (status in ('none', 'trialing', 'active', 'past_due', 'canceled')),
  seat_limit int,
  trial_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.billing_accounts enable row level security;

drop policy if exists billing_accounts_select_org on public.billing_accounts;
create policy billing_accounts_select_org
  on public.billing_accounts for select
  to authenticated
  using (organization_id = public.current_org_id());

insert into public.billing_accounts (organization_id, plan_key, status)
select o.id, 'free', 'none'
from public.organizations o
on conflict (organization_id) do nothing;

create or replace function public.ensure_billing_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.billing_accounts (organization_id, plan_key, status)
  values (new.id, 'free', 'none')
  on conflict (organization_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_organizations_billing on public.organizations;
create trigger trg_organizations_billing
  after insert on public.organizations
  for each row
  execute function public.ensure_billing_account();

-- ---------------------------------------------------------------------------
-- Ensure owner Person + owner flags on bootstrap / additional org
-- ---------------------------------------------------------------------------
create or replace function public.ensure_owner_person(
  p_org uuid,
  p_user uuid,
  p_name text,
  p_email text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.organizations
  set owner_user_id = coalesce(owner_user_id, p_user)
  where id = p_org;

  update public.organization_memberships
  set is_owner = true, role = 'admin'
  where user_id = p_user and organization_id = p_org;

  if not exists (
    select 1 from public.people
    where organization_id = p_org and profile_id = p_user and deleted_at is null
  ) then
    insert into public.people (
      organization_id, profile_id, name, email, role_title
    ) values (
      p_org, p_user, coalesce(nullif(trim(p_name), ''), 'Owner'),
      nullif(lower(trim(p_email)), ''), 'Owner'
    );
  end if;
end;
$$;

create or replace function public.bootstrap_organization(
  org_name text,
  user_full_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  user_email text;
  org_label text;
  org_slug text;
  n int := 2;
  allow_signup boolean;
  display_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if exists (
    select 1 from public.organization_memberships m where m.user_id = auth.uid()
  ) then
    return coalesce(
      public.current_org_id(),
      (
        select m.organization_id
        from public.organization_memberships m
        where m.user_id = auth.uid()
        order by m.created_at
        limit 1
      )
    );
  end if;

  select coalesce(
    (select s.allow_workspace_signup from public.app_settings s where s.id = 1),
    true
  )
  into allow_signup;

  if allow_signup is distinct from true then
    raise exception 'Workspace creation is disabled';
  end if;

  user_email := coalesce(auth.jwt() ->> 'email', '');
  display_name := coalesce(
    nullif(trim(user_full_name), ''),
    split_part(user_email, '@', 1),
    'Owner'
  );
  org_label := coalesce(nullif(trim(org_name), ''), 'My workspace');
  org_slug := nullif(public.slugify(org_label), '');
  if org_slug is null or org_slug = '' then
    org_slug := 'workspace';
  end if;
  while exists (select 1 from public.organizations where slug = org_slug) loop
    org_slug := coalesce(nullif(public.slugify(org_label), ''), 'workspace') || '-' || n;
    n := n + 1;
  end loop;

  insert into public.organizations (name, slug, owner_user_id)
  values (org_label, org_slug, auth.uid())
  returning id into new_org_id;

  insert into public.organization_settings (organization_id)
  values (new_org_id)
  on conflict (organization_id) do nothing;

  insert into public.profiles (id, organization_id, email, full_name, role)
  values (
    auth.uid(),
    new_org_id,
    user_email,
    display_name,
    'admin'
  )
  on conflict (id) do update
    set organization_id = excluded.organization_id,
        email = excluded.email,
        full_name = excluded.full_name,
        role = excluded.role;

  insert into public.organization_memberships (user_id, organization_id, role, is_owner)
  values (auth.uid(), new_org_id, 'admin', true)
  on conflict (user_id, organization_id) do update
    set role = excluded.role,
        is_owner = true;

  insert into public.user_active_organization (user_id, organization_id, updated_at)
  values (auth.uid(), new_org_id, now())
  on conflict (user_id) do update
    set organization_id = excluded.organization_id,
        updated_at = now();

  perform public.ensure_owner_person(new_org_id, auth.uid(), display_name, user_email);

  return new_org_id;
end;
$$;

grant execute on function public.bootstrap_organization(text, text) to authenticated;

create or replace function public.create_additional_organization(
  org_name text,
  user_full_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  user_email text;
  org_label text;
  org_slug text;
  n int := 2;
  allow_signup boolean;
  display_name text;
  existing_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(
    (select s.allow_workspace_signup from public.app_settings s where s.id = 1),
    true
  )
  into allow_signup;

  if allow_signup is distinct from true then
    raise exception 'Workspace creation is disabled';
  end if;

  user_email := coalesce(auth.jwt() ->> 'email', '');

  select p.full_name into existing_name
  from public.profiles p
  where p.id = auth.uid();

  display_name := coalesce(
    nullif(trim(user_full_name), ''),
    nullif(trim(existing_name), ''),
    split_part(user_email, '@', 1),
    'Owner'
  );
  org_label := coalesce(nullif(trim(org_name), ''), 'My workspace');
  org_slug := nullif(public.slugify(org_label), '');
  if org_slug is null or org_slug = '' then
    org_slug := 'workspace';
  end if;
  while exists (select 1 from public.organizations where slug = org_slug) loop
    org_slug := coalesce(nullif(public.slugify(org_label), ''), 'workspace') || '-' || n;
    n := n + 1;
  end loop;

  insert into public.organizations (name, slug, owner_user_id)
  values (org_label, org_slug, auth.uid())
  returning id into new_org_id;

  insert into public.profiles (id, organization_id, email, full_name, role)
  values (
    auth.uid(),
    new_org_id,
    user_email,
    display_name,
    'admin'
  )
  on conflict (id) do update
    set email = coalesce(nullif(profiles.email, ''), excluded.email),
        full_name = coalesce(nullif(profiles.full_name, ''), excluded.full_name);

  insert into public.organization_memberships (user_id, organization_id, role, is_owner)
  values (auth.uid(), new_org_id, 'admin', true)
  on conflict (user_id, organization_id) do update
    set role = excluded.role,
        is_owner = true;

  insert into public.user_active_organization (user_id, organization_id, updated_at)
  values (auth.uid(), new_org_id, now())
  on conflict (user_id) do update
    set organization_id = excluded.organization_id,
        updated_at = now();

  perform public.sync_profile_active_org(auth.uid());
  perform public.ensure_owner_person(new_org_id, auth.uid(), display_name, user_email);

  return new_org_id;
end;
$$;

revoke all on function public.create_additional_organization(text, text) from public;
grant execute on function public.create_additional_organization(text, text) to authenticated;
