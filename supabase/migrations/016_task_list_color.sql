-- Per-list header color for task boards
alter table public.task_lists
  add column if not exists color text;
