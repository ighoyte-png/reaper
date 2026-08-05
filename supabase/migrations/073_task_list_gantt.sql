-- Gantt view flags and date range on task lists.

alter table public.task_lists
  add column if not exists gantt_enabled boolean not null default false;

alter table public.task_lists
  add column if not exists start_date date null;

alter table public.task_lists
  add column if not exists end_date date null;
