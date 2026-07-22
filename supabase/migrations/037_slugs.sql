-- Human-readable URL slugs for workspace / client / project paths.

create or replace function public.slugify(input text)
returns text
language sql
immutable
as $$
  select trim(both '-' from lower(
    regexp_replace(
      regexp_replace(coalesce(input, ''), '[^a-zA-Z0-9]+', '-', 'g'),
      '-{2,}',
      '-',
      'g'
    )
  ));
$$;

alter table public.organizations
  add column if not exists slug text;

alter table public.clients
  add column if not exists slug text;

alter table public.projects
  add column if not exists slug text;

-- Assign clean name-based slugs (append -2, -3, … only on collision).
-- Organizations (global uniqueness).
with ranked as (
  select
    id,
    coalesce(nullif(public.slugify(name), ''), 'workspace') as base,
    row_number() over (
      partition by coalesce(nullif(public.slugify(name), ''), 'workspace')
      order by created_at nulls last, id
    ) as rn
  from public.organizations
  where slug is null or slug = ''
)
update public.organizations o
set slug = case when r.rn = 1 then r.base else r.base || '-' || r.rn end
from ranked r
where o.id = r.id;

-- Clients (unique per organization).
with ranked as (
  select
    id,
    coalesce(nullif(public.slugify(name), ''), 'client') as base,
    row_number() over (
      partition by organization_id, coalesce(nullif(public.slugify(name), ''), 'client')
      order by id
    ) as rn
  from public.clients
  where slug is null or slug = ''
)
update public.clients c
set slug = case
  when r.base = 'uncategorized' then 'client' || case when r.rn = 1 then '' else '-' || r.rn end
  when r.rn = 1 then r.base
  else r.base || '-' || r.rn
end
from ranked r
where c.id = r.id;

-- Projects (unique per organization + client bucket).
with ranked as (
  select
    id,
    coalesce(nullif(public.slugify(name), ''), 'project') as base,
    row_number() over (
      partition by
        organization_id,
        coalesce(client_id::text, 'uncategorized'),
        coalesce(nullif(public.slugify(name), ''), 'project')
      order by id
    ) as rn
  from public.projects
  where slug is null or slug = ''
)
update public.projects p
set slug = case when r.rn = 1 then r.base else r.base || '-' || r.rn end
from ranked r
where p.id = r.id;

-- Fallbacks if anything still empty.
update public.organizations
set slug = 'workspace-' || left(replace(id::text, '-', ''), 8)
where slug is null or slug = '';

update public.clients
set slug = 'client-' || left(replace(id::text, '-', ''), 8)
where slug is null or slug = '';

update public.projects
set slug = 'project-' || left(replace(id::text, '-', ''), 8)
where slug is null or slug = '';

alter table public.organizations
  alter column slug set not null;

alter table public.clients
  alter column slug set not null;

alter table public.projects
  alter column slug set not null;

create unique index if not exists organizations_slug_uidx
  on public.organizations (slug);

create unique index if not exists clients_org_slug_uidx
  on public.clients (organization_id, slug);

-- Null client_id projects share the "uncategorized" uniqueness bucket.
create unique index if not exists projects_org_client_slug_uidx
  on public.projects (
    organization_id,
    (coalesce(client_id::text, 'uncategorized')),
    slug
  );

-- Bootstrap must set organization.slug for new workspaces.
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
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if exists (select 1 from public.profiles where id = auth.uid()) then
    return (select organization_id from public.profiles where id = auth.uid());
  end if;

  user_email := coalesce(auth.jwt() ->> 'email', '');
  org_label := coalesce(nullif(trim(org_name), ''), 'My workspace');
  org_slug := nullif(public.slugify(org_label), '');
  if org_slug is null or org_slug = '' then
    org_slug := 'workspace';
  end if;
  while exists (select 1 from public.organizations where slug = org_slug) loop
    org_slug := public.slugify(org_label) || '-' || n;
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
