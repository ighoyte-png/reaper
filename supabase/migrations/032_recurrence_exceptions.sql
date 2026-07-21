-- Week-start dates (Mon) excluded from a weekly series without splitting it.
alter table public.assignments
  add column if not exists recurrence_exceptions text[] not null default '{}';
