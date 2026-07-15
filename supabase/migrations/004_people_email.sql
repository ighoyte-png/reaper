-- Optional work email on people (used when inviting)
alter table public.people
  add column if not exists email text;
