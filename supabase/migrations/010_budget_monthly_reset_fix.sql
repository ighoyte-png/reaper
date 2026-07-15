-- Ensure monthly-reset column + budget_mode 'none' exist (idempotent).
-- Do not rewrite rows to 'none' in this file — Postgres cannot use a newly
-- added enum label in the same transaction. See 011.
alter table public.projects
  add column if not exists budget_monthly_reset boolean not null default false;

alter table public.projects
  alter column budget_hours drop not null;

alter table public.projects
  alter column budget_hours set default null;

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
