-- Soft-archive for project task lists (hidden from main board until restored).
alter table public.task_lists
  add column if not exists archived boolean not null default false;

create index if not exists task_lists_project_archived_idx
  on public.task_lists (project_id, archived);
