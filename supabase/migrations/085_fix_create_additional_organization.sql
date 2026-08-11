-- Fix create_additional_organization:
-- 1) Allow when app_settings row is missing (NULL was treated as disabled).
-- 2) Insert membership + active org before mirroring profile role/org
--    so protect_profile_privileged_columns allows the sync.

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

  -- Missing app_settings row must not disable creation (SELECT INTO leaves NULL).
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

  insert into public.organizations (name, slug)
  values (org_label, org_slug)
  returning id into new_org_id;

  -- Ensure a profile row exists; do not move org/role yet (trigger).
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

  insert into public.organization_memberships (user_id, organization_id, role)
  values (auth.uid(), new_org_id, 'admin')
  on conflict (user_id, organization_id) do update
    set role = excluded.role;

  insert into public.user_active_organization (user_id, organization_id, updated_at)
  values (auth.uid(), new_org_id, now())
  on conflict (user_id) do update
    set organization_id = excluded.organization_id,
        updated_at = now();

  -- Mirror active membership onto profiles (allowed because membership exists).
  perform public.sync_profile_active_org(auth.uid());

  return new_org_id;
end;
$$;

revoke all on function public.create_additional_organization(text, text) from public;
grant execute on function public.create_additional_organization(text, text) to authenticated;
