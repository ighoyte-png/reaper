-- Bind project tasks to calendar assignments (priority tasks on schedule).

create table if not exists public.assignment_bound_tasks (
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  primary key (assignment_id, task_id)
);

create index if not exists assignment_bound_tasks_task_idx
  on public.assignment_bound_tasks (task_id);

create index if not exists assignment_bound_tasks_org_idx
  on public.assignment_bound_tasks (organization_id);

alter table public.assignment_bound_tasks enable row level security;

drop policy if exists assignment_bound_tasks_select on public.assignment_bound_tasks;
create policy assignment_bound_tasks_select on public.assignment_bound_tasks for select
  using (organization_id = public.current_org_id());

drop policy if exists assignment_bound_tasks_write on public.assignment_bound_tasks;
create policy assignment_bound_tasks_write on public.assignment_bound_tasks for all
  using (
    organization_id = public.current_org_id()
    and public.current_role() in ('admin', 'manager')
  )
  with check (
    organization_id = public.current_org_id()
    and public.current_role() in ('admin', 'manager')
  );

alter table public.assignment_bound_tasks replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.assignment_bound_tasks;
exception
  when duplicate_object then null;
end $$;
