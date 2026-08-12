-- Recurring monthly contractor expenses (applies from month_key onward).

alter table public.project_contractor_expenses
  add column if not exists repeat_monthly boolean not null default false;

comment on column public.project_contractor_expenses.repeat_monthly is
  'When true, amount applies to month_key and every later calendar month.';
