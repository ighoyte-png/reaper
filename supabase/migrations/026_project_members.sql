-- Explicit project team roster (independent of schedule/task assignment)
create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  primary key (project_id, person_id)
);

create index if not exists project_members_person_idx
  on public.project_members (person_id);

create index if not exists project_members_org_idx
  on public.project_members (organization_id);

alter table public.project_members enable row level security;

create policy project_members_select on public.project_members for select
  using (organization_id = public.current_org_id());

create policy project_members_write on public.project_members for all
  using (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'))
  with check (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'));
