-- Public registration: approval status + platform addon allowlists.

-- ---------------------------------------------------------------------------
-- Platform settings
-- ---------------------------------------------------------------------------
alter table public.app_settings
  add column if not exists require_account_approval boolean not null default false;

alter table public.app_settings
  add column if not exists default_allowed_addons text[] not null default '{}'::text[];

-- ---------------------------------------------------------------------------
-- Organization approval
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column if not exists approval_status text not null default 'approved';

alter table public.organizations
  add column if not exists approved_at timestamptz;

alter table public.organizations
  add column if not exists approved_by uuid references auth.users(id) on delete set null;

alter table public.organizations
  add column if not exists rejection_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'organizations_approval_status_check'
  ) then
    alter table public.organizations
      add constraint organizations_approval_status_check
      check (approval_status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

update public.organizations
set approval_status = 'approved',
    approved_at = coalesce(approved_at, created_at, now())
where approval_status is distinct from 'approved'
   or approved_at is null;

create index if not exists organizations_approval_status_idx
  on public.organizations (approval_status)
  where approval_status = 'pending';

-- ---------------------------------------------------------------------------
-- Addon allowlist (platform-owned; missing key = not allowed)
-- ---------------------------------------------------------------------------
create table if not exists public.organization_addon_allowlist (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  addon_key text not null,
  allowed boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (organization_id, addon_key),
  constraint organization_addon_allowlist_key_check
    check (addon_key = lower(addon_key) and addon_key <> '')
);

alter table public.organization_addon_allowlist enable row level security;

drop policy if exists organization_addon_allowlist_select_org
  on public.organization_addon_allowlist;
create policy organization_addon_allowlist_select_org
  on public.organization_addon_allowlist for select
  to authenticated
  using (organization_id = public.current_org_id());

-- Writes via service role / platform APIs only.

create or replace function public.apply_default_addon_allowlist(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  keys text[];
  k text;
begin
  select coalesce(s.default_allowed_addons, '{}'::text[])
  into keys
  from public.app_settings s
  where s.id = 1;

  if keys is null then
    keys := '{}'::text[];
  end if;

  foreach k in array keys loop
    k := lower(trim(k));
    if k = '' then
      continue;
    end if;
    insert into public.organization_addon_allowlist (
      organization_id, addon_key, allowed, updated_at
    ) values (p_org, k, true, now())
    on conflict (organization_id, addon_key) do update
      set allowed = true,
          updated_at = now();
  end loop;
end;
$$;

revoke all on function public.apply_default_addon_allowlist(uuid) from public;
grant execute on function public.apply_default_addon_allowlist(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Bootstrap RPCs: set approval_status from require_account_approval
-- ---------------------------------------------------------------------------
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
  require_approval boolean;
  approval text;
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

  select
    coalesce(
      (select s.allow_workspace_signup from public.app_settings s where s.id = 1),
      true
    ),
    coalesce(
      (select s.require_account_approval from public.app_settings s where s.id = 1),
      false
    )
  into allow_signup, require_approval;

  if allow_signup is distinct from true then
    raise exception 'Workspace creation is disabled';
  end if;

  approval := case when require_approval then 'pending' else 'approved' end;

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

  insert into public.organizations (
    name, slug, owner_user_id, approval_status, approved_at
  ) values (
    org_label,
    org_slug,
    auth.uid(),
    approval,
    case when approval = 'approved' then now() else null end
  )
  returning id into new_org_id;

  insert into public.organization_settings (organization_id)
  values (new_org_id)
  on conflict (organization_id) do nothing;

  if approval = 'approved' then
    perform public.apply_default_addon_allowlist(new_org_id);
  end if;

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
  require_approval boolean;
  approval text;
  display_name text;
  existing_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select
    coalesce(
      (select s.allow_workspace_signup from public.app_settings s where s.id = 1),
      true
    ),
    coalesce(
      (select s.require_account_approval from public.app_settings s where s.id = 1),
      false
    )
  into allow_signup, require_approval;

  if allow_signup is distinct from true then
    raise exception 'Workspace creation is disabled';
  end if;

  approval := case when require_approval then 'pending' else 'approved' end;

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

  insert into public.organizations (
    name, slug, owner_user_id, approval_status, approved_at
  ) values (
    org_label,
    org_slug,
    auth.uid(),
    approval,
    case when approval = 'approved' then now() else null end
  )
  returning id into new_org_id;

  insert into public.organization_settings (organization_id)
  values (new_org_id)
  on conflict (organization_id) do nothing;

  if approval = 'approved' then
    perform public.apply_default_addon_allowlist(new_org_id);
  end if;

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
