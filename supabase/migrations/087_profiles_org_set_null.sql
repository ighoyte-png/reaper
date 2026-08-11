-- Multi-membership: profiles are identity rows. Do NOT cascade-delete a user's
-- profile when one of their orgs is removed (that wiped logins with other
-- memberships when the mirrored organization_id pointed at the deleted org).

alter table public.profiles
  alter column organization_id drop not null;

alter table public.profiles
  drop constraint if exists profiles_organization_id_fkey;

alter table public.profiles
  add constraint profiles_organization_id_fkey
  foreign key (organization_id)
  references public.organizations(id)
  on delete set null;

-- Self-heal: recreate caller's profile from remaining memberships + Auth.
create or replace function public.ensure_profile_from_memberships()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  existing public.profiles;
  mem_org uuid;
  mem_role public.app_role;
  user_email text;
  display_name text;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into existing from public.profiles where id = uid;
  if existing.id is not null then
    if public.current_org_id() is null
      and exists (
        select 1 from public.organization_memberships m where m.user_id = uid
      )
    then
      select m.organization_id into mem_org
      from public.organization_memberships m
      where m.user_id = uid
      order by m.created_at
      limit 1;
      insert into public.user_active_organization (user_id, organization_id, updated_at)
      values (uid, mem_org, now())
      on conflict (user_id) do update
        set organization_id = excluded.organization_id,
            updated_at = now();
      perform public.sync_profile_active_org(uid);
      select * into existing from public.profiles where id = uid;
    end if;
    return existing;
  end if;

  select m.organization_id, m.role into mem_org, mem_role
  from public.organization_memberships m
  where m.user_id = uid
  order by m.created_at
  limit 1;

  if mem_org is null then
    raise exception 'No organization memberships';
  end if;

  user_email := coalesce(auth.jwt() ->> 'email', '');
  display_name := coalesce(
    nullif(trim(auth.jwt() -> 'user_metadata' ->> 'full_name'), ''),
    split_part(user_email, '@', 1),
    'User'
  );

  insert into public.profiles (id, organization_id, email, full_name, role)
  values (uid, mem_org, user_email, display_name, mem_role)
  returning * into existing;

  insert into public.user_active_organization (user_id, organization_id, updated_at)
  values (uid, mem_org, now())
  on conflict (user_id) do update
    set organization_id = excluded.organization_id,
        updated_at = now();

  perform public.sync_profile_active_org(uid);
  select * into existing from public.profiles where id = uid;
  return existing;
end;
$$;

revoke all on function public.ensure_profile_from_memberships() from public;
grant execute on function public.ensure_profile_from_memberships() to authenticated;

-- Rebuild profiles for Auth users who still have memberships but lost their
-- profile row to an org CASCADE delete.
insert into public.profiles (id, organization_id, email, full_name, role)
select
  u.id,
  coalesce(
    (
      select a.organization_id
      from public.user_active_organization a
      join public.organization_memberships am
        on am.user_id = a.user_id
       and am.organization_id = a.organization_id
      where a.user_id = u.id
      limit 1
    ),
    (
      select m.organization_id
      from public.organization_memberships m
      where m.user_id = u.id
      order by m.created_at
      limit 1
    )
  ),
  coalesce(u.email, ''),
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    split_part(coalesce(u.email, 'user'), '@', 1),
    'User'
  ),
  coalesce(
    (
      select m.role
      from public.organization_memberships m
      where m.user_id = u.id
      order by m.created_at
      limit 1
    ),
    'member'::public.app_role
  )
from auth.users u
where exists (
  select 1 from public.organization_memberships m where m.user_id = u.id
)
and not exists (
  select 1 from public.profiles p where p.id = u.id
)
on conflict (id) do nothing;

insert into public.user_active_organization (user_id, organization_id, updated_at)
select
  m.user_id,
  m.organization_id,
  now()
from (
  select distinct on (user_id) user_id, organization_id
  from public.organization_memberships
  order by user_id, created_at
) m
where not exists (
  select 1
  from public.user_active_organization a
  where a.user_id = m.user_id
)
on conflict (user_id) do nothing;

update public.profiles p
set organization_id = null
where p.organization_id is not null
  and not exists (
    select 1 from public.organizations o where o.id = p.organization_id
  );

do $$
declare
  r record;
begin
  for r in
    select distinct user_id from public.organization_memberships
  loop
    perform public.sync_profile_active_org(r.user_id);
  end loop;
end;
$$;
