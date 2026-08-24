-- Opt-in "Notify the Assignee": timestamp on the task (bounded) + subtractive unread inbox.

alter table public.tasks
  add column if not exists assignee_notified_at timestamptz null;

-- Outstanding assigned-to-you notices only. Delete when read or dismissed.
create table if not exists public.task_assigned_unreads (
  task_id uuid not null references public.tasks(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, person_id)
);

create index if not exists task_assigned_unreads_person_idx
  on public.task_assigned_unreads (person_id);

create index if not exists task_assigned_unreads_org_idx
  on public.task_assigned_unreads (organization_id);

alter table public.task_assigned_unreads enable row level security;

drop policy if exists task_assigned_unreads_select on public.task_assigned_unreads;
create policy task_assigned_unreads_select on public.task_assigned_unreads for select
  using (
    organization_id = public.current_org_id()
    and (
      person_id = public.current_person_id()
      or public.current_role() in ('admin', 'manager')
    )
  );

drop policy if exists task_assigned_unreads_insert on public.task_assigned_unreads;
create policy task_assigned_unreads_insert on public.task_assigned_unreads for insert
  with check (
    organization_id = public.current_org_id()
    and public.current_role() in ('admin', 'manager')
  );

drop policy if exists task_assigned_unreads_delete on public.task_assigned_unreads;
create policy task_assigned_unreads_delete on public.task_assigned_unreads for delete
  using (
    organization_id = public.current_org_id()
    and (
      person_id = public.current_person_id()
      or public.current_role() in ('admin', 'manager')
    )
  );

alter table public.task_assigned_unreads replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.task_assigned_unreads;
exception
  when duplicate_object then null;
end $$;

-- Read-but-not-dismissed mention rows block unique (task_id, person_id) inserts.
delete from public.mention_unreads
where read_at is not null;
