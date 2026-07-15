-- Ensure monthly-reset column exists (idempotent).
alter table public.projects
  add column if not exists budget_monthly_reset boolean not null default false;

-- PG enum from 001 only has hours|amount|both — add none for optional budgets.
do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'budget_mode'
      and e.enumlabel = 'none'
  ) then
    alter type public.budget_mode add value 'none';
  end if;
end $$;

-- Migrate legacy 'both' rows to exclusive hours/amount/none.
update public.projects
set budget_mode = case
  when budget_mode::text = 'both' and coalesce(budget_hours, 0) > 0 then 'hours'::public.budget_mode
  when budget_mode::text = 'both' and budget_amount is not null then 'amount'::public.budget_mode
  when budget_mode::text = 'both' then 'none'::public.budget_mode
  else budget_mode
end
where budget_mode::text = 'both';

update public.projects
set budget_amount = null
where budget_mode = 'hours';

update public.projects
set budget_hours = null
where budget_mode = 'amount';

update public.projects
set budget_hours = null, budget_amount = null
where budget_mode = 'none';
