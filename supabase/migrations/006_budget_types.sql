-- Budget type: none | hours | amount (mutually exclusive).
-- Migrate legacy 'both' → prefer hours when hours > 0, else amount.
alter table public.projects
  alter column budget_hours drop not null;

alter table public.projects
  alter column budget_hours set default null;

alter table public.projects
  add column if not exists budget_monthly_reset boolean not null default false;

update public.projects
set budget_mode = case
  when budget_mode = 'both' and coalesce(budget_hours, 0) > 0 then 'hours'
  when budget_mode = 'both' and budget_amount is not null then 'amount'
  when budget_mode = 'both' then 'none'
  else budget_mode
end;

update public.projects
set budget_amount = null
where budget_mode = 'hours';

update public.projects
set budget_hours = null
where budget_mode = 'amount';

update public.projects
set budget_hours = null, budget_amount = null
where budget_mode = 'none';

update public.projects
set budget_hours = null
where coalesce(budget_hours, 0) <= 0 and budget_mode <> 'hours';

alter table public.projects
  drop constraint if exists projects_budget_mode_check;

alter table public.projects
  add constraint projects_budget_mode_check
  check (budget_mode in ('none', 'hours', 'amount'));

alter table public.projects
  alter column budget_mode set default 'hours';
