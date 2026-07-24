-- Org-level Pods for grouping people (filter bars, dashboard scope).

create table if not exists public.pods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  manager_person_id uuid references public.people(id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pods_org_sort_idx
  on public.pods (organization_id, sort_order);

create index if not exists pods_manager_idx
  on public.pods (manager_person_id);

create table if not exists public.pod_members (
  pod_id uuid not null references public.pods(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  primary key (pod_id, person_id)
);

create index if not exists pod_members_person_idx
  on public.pod_members (person_id);

create index if not exists pod_members_org_idx
  on public.pod_members (organization_id);

alter table public.pods enable row level security;
alter table public.pod_members enable row level security;

drop policy if exists pods_select on public.pods;
create policy pods_select on public.pods for select
  using (organization_id = public.current_org_id());

drop policy if exists pods_write on public.pods;
create policy pods_write on public.pods for all
  using (
    organization_id = public.current_org_id()
    and public.current_role() in ('admin', 'manager')
  )
  with check (
    organization_id = public.current_org_id()
    and public.current_role() in ('admin', 'manager')
  );

drop policy if exists pod_members_select on public.pod_members;
create policy pod_members_select on public.pod_members for select
  using (organization_id = public.current_org_id());

drop policy if exists pod_members_write on public.pod_members;
create policy pod_members_write on public.pod_members for all
  using (
    organization_id = public.current_org_id()
    and public.current_role() in ('admin', 'manager')
  )
  with check (
    organization_id = public.current_org_id()
    and public.current_role() in ('admin', 'manager')
  );
