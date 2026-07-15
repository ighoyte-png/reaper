-- Remap legacy budget_mode 'both' after enum value 'none' is committed (010).
update public.projects
set budget_mode = case
  when budget_mode::text = 'both' and coalesce(budget_hours, 0) > 0
    then 'hours'::public.budget_mode
  when budget_mode::text = 'both' and budget_amount is not null
    then 'amount'::public.budget_mode
  when budget_mode::text = 'both'
    then 'none'::public.budget_mode
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
set budget_hours = null, budget_amount = null, budget_monthly_reset = false
where budget_mode = 'none';
