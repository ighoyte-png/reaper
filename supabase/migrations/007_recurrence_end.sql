-- Optional end date for weekly recurring assignments (null = indefinite).
alter table public.assignments
  add column if not exists recurrence_end_date date null;
