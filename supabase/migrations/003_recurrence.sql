-- Weekly indefinite recurrence on assignments
alter table public.assignments
  add column if not exists recurrence text not null default 'none';

alter table public.assignments
  drop constraint if exists assignments_recurrence_check;

alter table public.assignments
  add constraint assignments_recurrence_check
  check (recurrence in ('none', 'weekly'));
