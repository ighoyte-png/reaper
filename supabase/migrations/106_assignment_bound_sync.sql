-- Extend assignment_bound_tasks with bind origin + out-of-sync flag.

alter table public.assignment_bound_tasks
  add column if not exists bound_source text not null default 'schedule';

alter table public.assignment_bound_tasks
  add column if not exists out_of_sync boolean not null default false;

do $$
begin
  alter table public.assignment_bound_tasks
    drop constraint if exists assignment_bound_tasks_bound_source_check;
  alter table public.assignment_bound_tasks
    add constraint assignment_bound_tasks_bound_source_check
    check (bound_source in ('project', 'schedule'));
exception
  when others then null;
end $$;

comment on column public.assignment_bound_tasks.bound_source is
  'project = bound from project task edit (locks Gantt-bound assignment moves); schedule = bound from Schedule Tasks tab';

comment on column public.assignment_bound_tasks.out_of_sync is
  'True when a required Schedule date update could not complete (conflict); binding remains';
