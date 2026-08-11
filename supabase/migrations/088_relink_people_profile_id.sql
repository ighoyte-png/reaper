-- After cascade-deleted profiles were rebuilt (087), people.profile_id was left
-- NULL (SET NULL on profile delete). Members only see their own schedule row
-- via myPerson = people.where(profile_id = auth.uid()), so they appeared empty.

-- Relink active people rows to profiles by email within shared membership orgs.
update public.people pe
set profile_id = p.id
from public.profiles p
inner join public.organization_memberships m
  on m.user_id = p.id
where m.organization_id = pe.organization_id
  and pe.profile_id is null
  and pe.deleted_at is null
  and nullif(trim(pe.email), '') is not null
  and lower(trim(pe.email)) = lower(trim(p.email))
  and not exists (
    select 1
    from public.people other
    where other.organization_id = pe.organization_id
      and other.profile_id = p.id
      and other.deleted_at is null
      and other.id is distinct from pe.id
  );

-- Keep ensure_profile_from_memberships in sync: also relink people after rebuild.
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
  else
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
  end if;

  -- Relink this user's People row(s) in orgs they belong to (by email).
  update public.people pe
  set profile_id = uid
  from public.organization_memberships m
  where m.user_id = uid
    and m.organization_id = pe.organization_id
    and pe.profile_id is null
    and pe.deleted_at is null
    and nullif(trim(pe.email), '') is not null
    and lower(trim(pe.email)) = lower(trim(existing.email))
    and not exists (
      select 1
      from public.people other
      where other.organization_id = pe.organization_id
        and other.profile_id = uid
        and other.deleted_at is null
        and other.id is distinct from pe.id
    );

  return existing;
end;
$$;

revoke all on function public.ensure_profile_from_memberships() from public;
grant execute on function public.ensure_profile_from_memberships() to authenticated;
