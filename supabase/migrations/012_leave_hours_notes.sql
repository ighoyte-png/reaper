-- Optional hours + notes on leave days (time-off blocks).
alter table public.leave_days
  add column if not exists hours_per_day numeric null;

alter table public.leave_days
  add column if not exists notes text not null default '';
