-- Re-slugify to clean name-based URLs (drop short-id suffixes from 037 backfill).
-- Collision rule: base slug, then -2, -3, …

-- Organizations
with ranked as (
  select
    id,
    coalesce(nullif(public.slugify(name), ''), 'workspace') as base,
    row_number() over (
      partition by coalesce(nullif(public.slugify(name), ''), 'workspace')
      order by created_at nulls last, id
    ) as rn
  from public.organizations
)
update public.organizations o
set slug = case when r.rn = 1 then r.base else r.base || '-' || r.rn end
from ranked r
where o.id = r.id;

-- Clients
with ranked as (
  select
    id,
    case
      when coalesce(nullif(public.slugify(name), ''), 'client') = 'uncategorized'
        then 'client'
      else coalesce(nullif(public.slugify(name), ''), 'client')
    end as base,
    row_number() over (
      partition by
        organization_id,
        case
          when coalesce(nullif(public.slugify(name), ''), 'client') = 'uncategorized'
            then 'client'
          else coalesce(nullif(public.slugify(name), ''), 'client')
        end
      order by id
    ) as rn
  from public.clients
)
update public.clients c
set slug = case when r.rn = 1 then r.base else r.base || '-' || r.rn end
from ranked r
where c.id = r.id;

-- Projects
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
)
update public.projects p
set slug = case when r.rn = 1 then r.base else r.base || '-' || r.rn end
from ranked r
where p.id = r.id;

-- Keep bootstrap collision style aligned ( -2, -3, … not random hex ).
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
