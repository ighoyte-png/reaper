-- Optional section dividers in task lists (visual separators, not real tasks).

alter table public.tasks
  add column if not exists is_divider boolean not null default false;
