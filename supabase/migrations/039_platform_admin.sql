-- Platform admin: global settings + soft-disable workspaces.

create table if not exists public.app_settings (
  id integer primary key check (id = 1),
  allow_workspace_signup boolean not null default true
);

insert into public.app_settings (id, allow_workspace_signup)
values (1, true)
on conflict (id) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings
  for select
  to anon, authenticated
  using (true);

-- Writes only via service role (bypasses RLS).

alter table public.organizations
  add column if not exists disabled_at timestamptz;

-- Gate workspace creation on the global setting.
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
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if exists (select 1 from public.profiles where id = auth.uid()) then
    return (select organization_id from public.profiles where id = auth.uid());
  end if;

  select coalesce(allow_workspace_signup, true)
  into allow_signup
  from public.app_settings
  where id = 1;

  if allow_signup is distinct from true then
    raise exception 'Workspace creation is disabled';
  end if;

  user_email := coalesce(auth.jwt() ->> 'email', '');
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
    coalesce(nullif(trim(user_full_name), ''), split_part(user_email, '@', 1), 'Owner'),
    'admin'
  );

  return new_org_id;
end;
$$;
