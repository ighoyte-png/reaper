-- Client Review special subtasks (parent-bound yellow gate).

alter table public.tasks
  add column if not exists is_client_review boolean not null default false;
