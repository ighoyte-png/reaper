-- Allow a newly signed-in user to create their org + admin profile.
-- Fixes profile SELECT chicken-and-egg (own row before current_org_id works).

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or organization_id = public.current_org_id());

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
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if exists (select 1 from public.profiles where id = auth.uid()) then
    return (select organization_id from public.profiles where id = auth.uid());
  end if;

  user_email := coalesce(auth.jwt() ->> 'email', '');

  insert into public.organizations (name)
  values (coalesce(nullif(trim(org_name), ''), 'My workspace'))
  returning id into new_org_id;

  insert into public.profiles (id, organization_id, email, full_name, role)
  values (
    auth.uid(),
    new_org_id,
    user_email,
    coalesce(nullif(trim(user_full_name), ''), split_part(user_email, '@', 1), 'Owner'),
    'admin'
  );

  return new_org_id;
end;
$$;

grant execute on function public.bootstrap_organization(text, text) to authenticated;

-- Helpers to clear org data before re-seeding demo (admin/manager only via RLS on deletes).
create or replace function public.clear_organization_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid;
  r public.app_role;
begin
  org := public.current_org_id();
  r := public.current_role();
  if org is null then
    raise exception 'No organization';
  end if;
  if r is distinct from 'admin' and r is distinct from 'manager' then
    raise exception 'Not allowed';
  end if;

  delete from public.assignments where organization_id = org;
  delete from public.leave_days where organization_id = org;
  delete from public.milestones where organization_id = org;
  delete from public.projects where organization_id = org;
  delete from public.clients where organization_id = org;
  delete from public.people where organization_id = org;
end;
$$;

grant execute on function public.clear_organization_data() to authenticated;
