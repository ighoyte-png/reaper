-- Multi-workspace memberships: one Auth user → many orgs with per-org roles.
-- Active org is stored in user_active_organization (URL drives switch via RPC).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.organization_memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role public.app_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (user_id, organization_id)
);

create index if not exists organization_memberships_org_idx
  on public.organization_memberships (organization_id);

create table if not exists public.user_active_organization (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  updated_at timestamptz not null default now()
);

alter table public.organization_memberships enable row level security;
alter table public.user_active_organization enable row level security;

drop policy if exists organization_memberships_select_own on public.organization_memberships;
create policy organization_memberships_select_own
  on public.organization_memberships for select
  to authenticated
  using (user_id = auth.uid());

-- Members of the active org can see coworker's membership rows in that org
-- (needed to load peer roles when building the directory).
drop policy if exists organization_memberships_select_active_org on public.organization_memberships;
create policy organization_memberships_select_active_org
  on public.organization_memberships for select
  to authenticated
  using (organization_id = public.current_org_id());

drop policy if exists user_active_organization_select_own on public.user_active_organization;
create policy user_active_organization_select_own
  on public.user_active_organization for select
  to authenticated
  using (user_id = auth.uid());

-- Writes via security definer RPCs / service role only.

-- ---------------------------------------------------------------------------
-- Backfill from profiles
-- ---------------------------------------------------------------------------
insert into public.organization_memberships (user_id, organization_id, role)
select p.id, p.organization_id, p.role
from public.profiles p
where p.organization_id is not null
on conflict (user_id, organization_id) do nothing;

insert into public.user_active_organization (user_id, organization_id)
select p.id, p.organization_id
from public.profiles p
where p.organization_id is not null
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Helpers (same names; membership + active-org aware)
-- ---------------------------------------------------------------------------
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.organization_id
  from public.user_active_organization a
  join public.organization_memberships m
    on m.user_id = a.user_id
   and m.organization_id = a.organization_id
  join public.organizations o on o.id = a.organization_id
  where a.user_id = auth.uid()
    and o.disabled_at is null
$$;

create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.user_active_organization a
  join public.organization_memberships m
    on m.user_id = a.user_id
   and m.organization_id = a.organization_id
  join public.organizations o on o.id = a.organization_id
  where a.user_id = auth.uid()
    and o.disabled_at is null
$$;

create or replace function public.current_person_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select pe.id
  from public.people pe
  where pe.profile_id = auth.uid()
    and pe.organization_id = public.current_org_id()
    and pe.deleted_at is null
  limit 1
$$;

revoke all on function public.current_org_id() from public;
revoke all on function public.current_role() from public;
revoke all on function public.current_person_id() from public;
grant execute on function public.current_org_id() to authenticated;
grant execute on function public.current_role() to authenticated;
grant execute on function public.current_person_id() to authenticated;

-- Keep profiles.organization_id / role mirrored to active membership for
-- legacy reads; helpers above are source of truth for RLS.
create or replace function public.sync_profile_active_org(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  active_org uuid;
  active_role public.app_role;
begin
  select a.organization_id, m.role
    into active_org, active_role
  from public.user_active_organization a
  join public.organization_memberships m
    on m.user_id = a.user_id
   and m.organization_id = a.organization_id
  where a.user_id = p_user_id;

  if active_org is null then
    return;
  end if;

  update public.profiles
  set organization_id = active_org,
      role = active_role
  where id = p_user_id
    and (
      organization_id is distinct from active_org
      or role is distinct from active_role
    );
end;
$$;

create or replace function public.switch_organization(p_organization_id uuid)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  org public.organizations;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_organization_id is null then
    raise exception 'organization_id is required';
  end if;

  if not exists (
    select 1
    from public.organization_memberships m
    where m.user_id = auth.uid()
      and m.organization_id = p_organization_id
  ) then
    raise exception 'Not a member of that workspace';
  end if;

  select o.* into org
  from public.organizations o
  where o.id = p_organization_id;

  if org.id is null then
    raise exception 'Workspace not found';
  end if;

  if org.disabled_at is not null then
    raise exception 'Workspace is disabled';
  end if;

  insert into public.user_active_organization (user_id, organization_id, updated_at)
  values (auth.uid(), p_organization_id, now())
  on conflict (user_id) do update
    set organization_id = excluded.organization_id,
        updated_at = now();

  perform public.sync_profile_active_org(auth.uid());

  return org;
end;
$$;

revoke all on function public.switch_organization(uuid) from public;
grant execute on function public.switch_organization(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Bootstrap: first workspace only when user has no memberships
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
  display_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Already a member somewhere: return active (or first) membership — do not
  -- create another workspace from the legacy "existing profile" shortcut.
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

  select coalesce(allow_workspace_signup, true)
  into allow_signup
  from public.app_settings
  where id = 1;

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

  insert into public.organizations (name, slug)
  values (org_label, org_slug)
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
    set organization_id = excluded.organization_id,
        email = excluded.email,
        full_name = excluded.full_name,
        role = excluded.role;

  insert into public.organization_memberships (user_id, organization_id, role)
  values (auth.uid(), new_org_id, 'admin')
  on conflict (user_id, organization_id) do update
    set role = excluded.role;

  insert into public.user_active_organization (user_id, organization_id, updated_at)
  values (auth.uid(), new_org_id, now())
  on conflict (user_id) do update
    set organization_id = excluded.organization_id,
        updated_at = now();

  return new_org_id;
end;
$$;

grant execute on function public.bootstrap_organization(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Profiles RLS: see self always; peers via active-org membership
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.organization_memberships m
      where m.user_id = profiles.id
        and m.organization_id = public.current_org_id()
    )
  );

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Role / organization_id on profiles are mirrors; managers update membership
-- via API. Still block self-escalation of mirrored role on the profile row.
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.app_role;
begin
  if TG_OP <> 'UPDATE' then
    return new;
  end if;

  -- Allow sync_profile_active_org / service_role to move organization_id.
  if new.organization_id is distinct from old.organization_id then
    if auth.uid() is distinct from new.id
      and coalesce(auth.jwt() ->> 'role', '') is distinct from 'service_role'
    then
      -- Manager/admin role changes use membership table; block peer org moves.
      if auth.uid() is not null and auth.uid() is distinct from old.id then
        raise exception 'organization_id cannot be changed';
      end if;
    end if;
  end if;

  if new.role is distinct from old.role then
    actor_role := public.current_role();
    if auth.uid() = new.id and actor_role is distinct from 'admin' then
      -- Self cannot escalate mirrored role unless syncing after switch.
      if actor_role is null
        or not exists (
          select 1
          from public.organization_memberships m
          where m.user_id = new.id
            and m.organization_id = new.organization_id
            and m.role = new.role
        )
      then
        raise exception 'role cannot be changed';
      end if;
    elsif actor_role = 'admin' then
      null;
    elsif actor_role = 'manager'
      and old.role in ('member', 'manager')
      and new.role in ('member', 'manager')
    then
      null;
    elsif auth.uid() is null
      or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    then
      null;
    elsif exists (
      select 1
      from public.organization_memberships m
      where m.user_id = new.id
        and m.organization_id = new.organization_id
        and m.role = new.role
    ) then
      -- Mirror sync after membership update
      null;
    else
      raise exception 'role cannot be changed';
    end if;
  end if;

  return new;
end;
$$;

-- Org select: user can read orgs they belong to (for switcher), plus current.
drop policy if exists org_select on public.organizations;
create policy org_select on public.organizations for select
  using (
    id = public.current_org_id()
    or exists (
      select 1
      from public.organization_memberships m
      where m.user_id = auth.uid()
        and m.organization_id = organizations.id
    )
  );

-- Managers/admins update peer roles in the active workspace.
create or replace function public.set_membership_role(
  p_user_id uuid,
  p_organization_id uuid,
  p_role public.app_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.app_role;
  target public.app_role;
  admin_count int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_organization_id is distinct from public.current_org_id() then
    raise exception 'Can only change roles in the active workspace';
  end if;

  actor := public.current_role();
  if actor is distinct from 'admin' and actor is distinct from 'manager' then
    raise exception 'Not allowed';
  end if;

  select m.role into target
  from public.organization_memberships m
  where m.user_id = p_user_id
    and m.organization_id = p_organization_id;

  if target is null then
    raise exception 'Membership not found';
  end if;

  if actor = 'manager' then
    if target = 'admin' or p_role = 'admin' then
      raise exception 'Only admins can change admin access';
    end if;
    if p_role is distinct from 'member' and p_role is distinct from 'manager' then
      raise exception 'Invalid role';
    end if;
  end if;

  if target = 'admin' and p_role is distinct from 'admin' then
    select count(*)::int into admin_count
    from public.organization_memberships m
    where m.organization_id = p_organization_id
      and m.role = 'admin';
    if admin_count <= 1 then
      raise exception 'Keep at least one admin on the organization';
    end if;
  end if;

  update public.organization_memberships
  set role = p_role
  where user_id = p_user_id
    and organization_id = p_organization_id;

  -- Keep profile mirror in sync when this is the member's active org.
  update public.profiles p
  set role = p_role,
      organization_id = p_organization_id
  from public.user_active_organization a
  where p.id = p_user_id
    and a.user_id = p_user_id
    and a.organization_id = p_organization_id;
end;
$$;

revoke all on function public.set_membership_role(uuid, uuid, public.app_role) from public;
grant execute on function public.set_membership_role(uuid, uuid, public.app_role) to authenticated;
