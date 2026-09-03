-- Opt-in Assignment Time reporting for hours + monthly-reset projects.

alter table public.projects
  add column if not exists assignment_time_reporting boolean not null default false;
