-- Contractor expense hours entries, repeat end month, and apply-window RPCs.

alter table public.project_contractor_expenses
  add column if not exists hours numeric not null default 0 check (hours >= 0);

alter table public.project_contractor_expenses
  add column if not exists repeat_end_month date null;

comment on column public.project_contractor_expenses.hours is
  'Hours for this month (or start month when repeat_monthly). Mutually exclusive with amount.';

comment on column public.project_contractor_expenses.repeat_end_month is
  'Inclusive last month a repeating row applies. Null means through the year/project apply window.';

delete from public.project_contractor_expenses
where coalesce(amount, 0) = 0 and coalesce(hours, 0) = 0;

alter table public.project_contractor_expenses
  drop constraint if exists project_contractor_expenses_amount_xor_hours;

alter table public.project_contractor_expenses
  add constraint project_contractor_expenses_amount_xor_hours
  check (
    (amount > 0 and hours = 0)
    or (hours > 0 and amount = 0)
  );

alter table public.project_contractor_expenses
  drop constraint if exists project_contractor_expenses_repeat_end_first_of_month;

alter table public.project_contractor_expenses
  add constraint project_contractor_expenses_repeat_end_first_of_month
  check (
    repeat_end_month is null
    or repeat_end_month = date_trunc('month', repeat_end_month)::date
  );

insert into public.project_contractor_expenses (
  organization_id,
  project_id,
  person_id,
  month_key,
  amount,
  hours,
  notes,
  repeat_monthly
)
select
  pm.organization_id,
  pm.project_id,
  pm.person_id,
  date_trunc('month', current_date)::date,
  0,
  pm.contractor_hours,
  '',
  true
from public.project_members pm
join public.projects p on p.id = pm.project_id
where pm.contractor_mode = 'hours'
  and coalesce(pm.contractor_hours, 0) > 0
  and coalesce(p.budget_monthly_reset, false)
  and p.budget_mode::text in ('hours', 'amount')
  and not exists (
    select 1
    from public.project_contractor_expenses e
    where e.project_id = pm.project_id
      and e.person_id = pm.person_id
      and coalesce(e.hours, 0) > 0
  );

update public.project_members pm
set contractor_hours = null
from public.projects p
where p.id = pm.project_id
  and pm.contractor_mode = 'hours'
  and coalesce(p.budget_monthly_reset, false)
  and p.budget_mode::text in ('hours', 'amount');

create or replace function public.contractor_expense_applies_in_month(
  p_month_key date,
  p_repeat_monthly boolean,
  p_repeat_end_month date,
  p_project_start date,
  p_project_end date,
  p_target_month date
)
returns boolean
language sql
immutable
parallel safe
as $$
  select
    case
      when p_target_month is null or p_month_key is null then false
      when p_project_start is not null
        and date_trunc('month', p_target_month)::date
          < date_trunc('month', p_project_start)::date
        then false
      when p_project_end is not null
        and date_trunc('month', p_target_month)::date
          > date_trunc('month', p_project_end)::date
        then false
      when not coalesce(p_repeat_monthly, false) then
        date_trunc('month', p_month_key)::date
          = date_trunc('month', p_target_month)::date
      when date_trunc('month', p_month_key)::date
        > date_trunc('month', p_target_month)::date
        then false
      else
        date_trunc('month', p_target_month)::date <= least(
          make_date(extract(year from p_month_key)::int, 12, 1),
          coalesce(
            date_trunc('month', p_project_end)::date,
            make_date(extract(year from p_month_key)::int, 12, 1)
          ),
          coalesce(
            date_trunc('month', p_repeat_end_month)::date,
            '9999-12-01'::date
          )
        )
    end
$$;

revoke all on function public.contractor_expense_applies_in_month(date, boolean, date, date, date, date) from public;
grant execute on function public.contractor_expense_applies_in_month(date, boolean, date, date, date, date) to authenticated;

-- Burns: monthly window for hours OR amount reset; expenses replace member fee commits on monthly projects.
drop function if exists public.rpc_project_budget_burns(date);

create function public.rpc_project_budget_burns(
  p_as_of date default current_date
)
returns table (
  project_id uuid,
  used_hours numeric,
  future_hours numeric,
  planned_hours numeric,
  used_amount numeric,
  future_amount numeric,
  planned_amount numeric,
  total_hours numeric,
  total_amount numeric,
  mode text,
  pct numeric,
  over_by numeric,
  remaining_hours numeric,
  remaining_amount numeric,
  amount_over_by numeric,
  contractor_hours numeric,
  contractor_amount numeric,
  contractor_used_hours numeric,
  contractor_future_hours numeric,
  contractor_used_amount numeric,
  contractor_future_amount numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with org as (
    select public.current_org_id() as id
  ),
  project_ranges as (
    select
      p.*,
      case
        when p.budget_mode::text in ('hours', 'amount', 'none') then p.budget_mode::text
        when coalesce(p.budget_hours, 0) > 0 then 'hours'
        when coalesce(p.budget_amount, 0) > 0 then 'amount'
        else 'none'
      end as normalized_mode,
      case
        when p.budget_mode::text in ('hours', 'amount') and p.budget_monthly_reset
          then date_trunc('month', p_as_of)::date
        else date '1970-01-01'
      end as range_start,
      case
        when p.budget_mode::text in ('hours', 'amount') and p.budget_monthly_reset
          then (date_trunc('month', p_as_of) + interval '1 month - 1 day')::date
        else date '2099-12-31'
      end as range_end
    from public.projects p
    join org on org.id = p.organization_id
    where not coalesce(p.sandbox_mode, false)
  ),
  roster_ids as (
    select pm.project_id, pm.person_id
    from public.project_members pm
    join project_ranges p on p.id = pm.project_id
    union
    select a.project_id, a.person_id
    from public.assignments a
    join project_ranges p on p.id = a.project_id
    where a.status = 'confirmed'
  ),
  roster as (
    select
      r.project_id,
      pe.id as person_id,
      case
        when not coalesce(pe.is_contractor, false) then 'staff'
        when not (
          coalesce(pe.hide_from_schedule, false)
          or coalesce(pe.hide_from_utilization, false)
        ) then 'staff'
        else
          case coalesce(
            pm.contractor_mode,
            case
              when coalesce(pe.hide_from_schedule, false) then 'fixed_fee'
              else 'scheduled'
            end
          )
            when 'fixed_fee' then 'commit_fee'
            when 'hours' then 'commit_hours'
            when 'scheduled' then 'contractor_scheduled'
            else 'staff'
          end
      end as kind,
      coalesce(nullif(pe.cost_rate, 0), os.default_cost_rate, 50) as profile_rate,
      coalesce(nullif(pe.cost_rate, 0), os.default_cost_rate, 50) as cost_rate,
      pm.contractor_fixed_fee,
      pm.contractor_hours
    from roster_ids r
    join public.people pe
      on pe.id = r.person_id
     and pe.organization_id = (
       select pr.organization_id from project_ranges pr where pr.id = r.project_id
     )
     and pe.deleted_at is null
    join public.organization_settings os on os.organization_id = pe.organization_id
    left join public.project_members pm
      on pm.project_id = r.project_id
     and pm.person_id = r.person_id
  ),
  schedule_totals as (
    select
      p.id,
      p.organization_id,
      p.budget_hours,
      p.budget_amount,
      p.normalized_mode,
      p.budget_monthly_reset,
      p.range_start,
      p.range_end,
      coalesce(sum(
        public.assignment_hours_in_range(
          a.start_date, a.end_date, a.hours_per_day, a.recurrence,
          a.recurrence_end_date, a.recurrence_exceptions,
          p.range_start, least(p_as_of, p.range_end)
        )
      ) filter (
        where p.range_start <= least(p_as_of, p.range_end)
          and r.kind = 'staff'
      ), 0) as staff_used_hours,
      coalesce(sum(
        public.assignment_hours_in_range(
          a.start_date, a.end_date, a.hours_per_day, a.recurrence,
          a.recurrence_end_date, a.recurrence_exceptions,
          p.range_start, least(p_as_of, p.range_end)
        )
      ) filter (
        where p.range_start <= least(p_as_of, p.range_end)
          and r.kind = 'contractor_scheduled'
      ), 0) as contractor_sched_used_hours,
      coalesce(sum(
        public.assignment_hours_in_range(
          a.start_date, a.end_date, a.hours_per_day, a.recurrence,
          a.recurrence_end_date, a.recurrence_exceptions,
          greatest(p_as_of + 1, p.range_start), p.range_end
        )
      ) filter (
        where greatest(p_as_of + 1, p.range_start) <= p.range_end
          and r.kind = 'staff'
      ), 0) as staff_future_hours,
      coalesce(sum(
        public.assignment_hours_in_range(
          a.start_date, a.end_date, a.hours_per_day, a.recurrence,
          a.recurrence_end_date, a.recurrence_exceptions,
          greatest(p_as_of + 1, p.range_start), p.range_end
        )
      ) filter (
        where greatest(p_as_of + 1, p.range_start) <= p.range_end
          and r.kind = 'contractor_scheduled'
      ), 0) as contractor_sched_future_hours,
      coalesce(sum(
        public.assignment_hours_in_range(
          a.start_date, a.end_date, a.hours_per_day, a.recurrence,
          a.recurrence_end_date, a.recurrence_exceptions,
          p.range_start, least(p_as_of, p.range_end)
        ) * coalesce(r.cost_rate, 0)
      ) filter (
        where p.range_start <= least(p_as_of, p.range_end)
          and r.kind = 'staff'
      ), 0) as staff_used_amount,
      coalesce(sum(
        public.assignment_hours_in_range(
          a.start_date, a.end_date, a.hours_per_day, a.recurrence,
          a.recurrence_end_date, a.recurrence_exceptions,
          p.range_start, least(p_as_of, p.range_end)
        ) * coalesce(r.cost_rate, 0)
      ) filter (
        where p.range_start <= least(p_as_of, p.range_end)
          and r.kind = 'contractor_scheduled'
      ), 0) as contractor_sched_used_amount,
      coalesce(sum(
        public.assignment_hours_in_range(
          a.start_date, a.end_date, a.hours_per_day, a.recurrence,
          a.recurrence_end_date, a.recurrence_exceptions,
          greatest(p_as_of + 1, p.range_start), p.range_end
        ) * coalesce(r.cost_rate, 0)
      ) filter (
        where greatest(p_as_of + 1, p.range_start) <= p.range_end
          and r.kind = 'staff'
      ), 0) as staff_future_amount,
      coalesce(sum(
        public.assignment_hours_in_range(
          a.start_date, a.end_date, a.hours_per_day, a.recurrence,
          a.recurrence_end_date, a.recurrence_exceptions,
          greatest(p_as_of + 1, p.range_start), p.range_end
        ) * coalesce(r.cost_rate, 0)
      ) filter (
        where greatest(p_as_of + 1, p.range_start) <= p.range_end
          and r.kind = 'contractor_scheduled'
      ), 0) as contractor_sched_future_amount
    from project_ranges p
    left join public.assignments a
      on a.project_id = p.id
     and a.organization_id = p.organization_id
     and a.status = 'confirmed'
    left join roster r
      on r.project_id = p.id
     and r.person_id = a.person_id
     and r.kind in ('staff', 'contractor_scheduled')
    group by
      p.id,
      p.organization_id,
      p.budget_hours,
      p.budget_amount,
      p.normalized_mode,
      p.budget_monthly_reset,
      p.range_start,
      p.range_end
  ),
  commit_totals as (
    select
      r.project_id,
      coalesce(sum(
        case
          when r.kind = 'commit_fee' then
            case
              when r.profile_rate > 0
                then coalesce(r.contractor_fixed_fee, 0) / r.profile_rate
              else 0
            end
          when r.kind = 'commit_hours' then coalesce(r.contractor_hours, 0)
          else 0
        end
      ), 0) as commit_used_hours,
      coalesce(sum(
        case
          when r.kind = 'commit_fee' then coalesce(r.contractor_fixed_fee, 0)
          when r.kind = 'commit_hours' then
            coalesce(r.contractor_hours, 0) * coalesce(r.profile_rate, 0)
          else 0
        end
      ), 0) as commit_used_amount
    from roster r
    join project_ranges p on p.id = r.project_id
    where r.kind in ('commit_fee', 'commit_hours')
      and not coalesce(p.budget_monthly_reset, false)
    group by r.project_id
  ),
  expense_totals as (
    select
      e.project_id,
      coalesce(sum(
        case
          when coalesce(e.amount, 0) > 0 then e.amount
          else coalesce(e.hours, 0)
            * coalesce(nullif(pe.cost_rate, 0), os.default_cost_rate, 50)
        end
      ), 0) as expense_amount,
      coalesce(sum(
        case
          when coalesce(e.hours, 0) > 0 then e.hours
          when coalesce(nullif(pe.cost_rate, 0), os.default_cost_rate, 50) > 0
            then e.amount / coalesce(nullif(pe.cost_rate, 0), os.default_cost_rate, 50)
          else 0
        end
      ), 0) as expense_hours
    from public.project_contractor_expenses e
    join project_ranges p
      on p.id = e.project_id
     and coalesce(p.budget_monthly_reset, false)
     and public.contractor_expense_applies_in_month(
       e.month_key,
       e.repeat_monthly,
       e.repeat_end_month,
       p.start_date,
       p.end_date,
       date_trunc('month', p_as_of)::date
     )
    join public.people pe
      on pe.id = e.person_id
     and pe.deleted_at is null
    join public.organization_settings os on os.organization_id = pe.organization_id
    group by e.project_id
  ),
  totals as (
    select
      s.id,
      s.budget_hours,
      s.budget_amount,
      s.normalized_mode,
      s.staff_used_hours
        + s.contractor_sched_used_hours
        + coalesce(c.commit_used_hours, 0)
        + coalesce(x.expense_hours, 0) as used_hours,
      s.staff_future_hours
        + s.contractor_sched_future_hours as future_hours,
      s.staff_used_amount
        + s.contractor_sched_used_amount
        + coalesce(c.commit_used_amount, 0)
        + coalesce(x.expense_amount, 0) as used_amount,
      s.staff_future_amount
        + s.contractor_sched_future_amount as future_amount,
      s.contractor_sched_used_hours
        + coalesce(c.commit_used_hours, 0)
        + coalesce(x.expense_hours, 0) as contractor_used_hours,
      s.contractor_sched_future_hours as contractor_future_hours,
      s.contractor_sched_used_amount
        + coalesce(c.commit_used_amount, 0)
        + coalesce(x.expense_amount, 0) as contractor_used_amount,
      s.contractor_sched_future_amount as contractor_future_amount
    from schedule_totals s
    left join commit_totals c on c.project_id = s.id
    left join expense_totals x on x.project_id = s.id
  )
  select
    id,
    used_hours,
    future_hours,
    used_hours + future_hours,
    used_amount,
    future_amount,
    used_amount + future_amount,
    case when normalized_mode = 'hours' then coalesce(budget_hours, 0) else 0 end,
    case when normalized_mode = 'amount' then coalesce(budget_amount, 0) else null end,
    normalized_mode,
    case
      when normalized_mode = 'hours' and coalesce(budget_hours, 0) > 0
        then least(999, ((used_hours + future_hours) / budget_hours) * 100)
      when normalized_mode = 'amount' and coalesce(budget_amount, 0) > 0
        then least(999, ((used_amount + future_amount) / budget_amount) * 100)
      else 0
    end,
    case when normalized_mode = 'hours'
      then greatest(0, used_hours + future_hours - coalesce(budget_hours, 0)) else 0 end,
    case when normalized_mode = 'hours'
      then coalesce(budget_hours, 0) - (used_hours + future_hours) else 0 end,
    case when normalized_mode = 'amount'
      then coalesce(budget_amount, 0) - (used_amount + future_amount) else null end,
    case when normalized_mode = 'amount'
      then greatest(0, used_amount + future_amount - coalesce(budget_amount, 0)) else 0 end,
    contractor_used_hours + contractor_future_hours,
    contractor_used_amount + contractor_future_amount,
    contractor_used_hours,
    contractor_future_hours,
    contractor_used_amount,
    contractor_future_amount
  from totals;
$$;

revoke all on function public.rpc_project_budget_burns(date) from public;
grant execute on function public.rpc_project_budget_burns(date) to authenticated;

-- Year bars: include amount+reset; expenses replace member fee commits on monthly projects.
create or replace function public.rpc_monthly_retainer_year_bars(
  p_year integer default extract(year from current_date)::integer,
  p_as_of date default current_date
)
returns table (
  project_id uuid,
  month_index integer,
  used_hours numeric,
  future_hours numeric,
  used_amount numeric,
  future_amount numeric,
  contractor_used_hours numeric,
  contractor_future_hours numeric,
  contractor_used_amount numeric,
  contractor_future_amount numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with org as (
    select public.current_org_id() as id
  ),
  projects_monthly as (
    select
      p.id,
      p.organization_id,
      p.start_date,
      coalesce(
        to_char(p.start_date, 'YYYY-MM'),
        to_char(p_as_of, 'YYYY-MM')
      ) as commit_month_key
    from public.projects p
    join org on org.id = p.organization_id
    where not coalesce(p.sandbox_mode, false)
      and p.budget_mode::text in ('hours', 'amount')
      and coalesce(p.budget_monthly_reset, false)
  ),
  months as (
    select generate_series(0, 11) as month_index
  ),
  project_months as (
    select
      p.id as project_id,
      p.organization_id,
      p.commit_month_key,
      m.month_index,
      make_date(p_year, m.month_index + 1, 1) as range_start,
      (make_date(p_year, m.month_index + 1, 1)
        + interval '1 month - 1 day')::date as range_end,
      to_char(make_date(p_year, m.month_index + 1, 1), 'YYYY-MM') as month_key,
      make_date(p_year, m.month_index + 1, 1) as month_date
    from projects_monthly p
    cross join months m
  ),
  roster_ids as (
    select pm.project_id, pm.person_id
    from public.project_members pm
    join projects_monthly p on p.id = pm.project_id
    union
    select a.project_id, a.person_id
    from public.assignments a
    join projects_monthly p on p.id = a.project_id
    where a.status = 'confirmed'
  ),
  roster as (
    select
      r.project_id,
      pe.id as person_id,
      case
        when not coalesce(pe.is_contractor, false) then 'staff'
        when not (
          coalesce(pe.hide_from_schedule, false)
          or coalesce(pe.hide_from_utilization, false)
        ) then 'staff'
        else
          case coalesce(
            pm.contractor_mode,
            case
              when coalesce(pe.hide_from_schedule, false) then 'fixed_fee'
              else 'scheduled'
            end
          )
            when 'fixed_fee' then 'commit_fee'
            when 'hours' then 'commit_hours'
            when 'scheduled' then 'contractor_scheduled'
            else 'staff'
          end
      end as kind,
      coalesce(nullif(pe.cost_rate, 0), os.default_cost_rate, 50) as profile_rate,
      coalesce(nullif(pe.cost_rate, 0), os.default_cost_rate, 50) as cost_rate,
      pm.contractor_fixed_fee,
      pm.contractor_hours
    from roster_ids r
    join public.people pe
      on pe.id = r.person_id
     and pe.deleted_at is null
    join projects_monthly p on p.id = r.project_id
     and pe.organization_id = p.organization_id
    join public.organization_settings os on os.organization_id = pe.organization_id
    left join public.project_members pm
      on pm.project_id = r.project_id
     and pm.person_id = r.person_id
  ),
  schedule_totals as (
    select
      pm.project_id,
      pm.month_index,
      coalesce(sum(
        public.assignment_hours_in_range(
          a.start_date, a.end_date, a.hours_per_day, a.recurrence,
          a.recurrence_end_date, a.recurrence_exceptions,
          pm.range_start, least(p_as_of, pm.range_end)
        )
      ) filter (
        where pm.range_start <= least(p_as_of, pm.range_end)
          and r.kind = 'staff'
      ), 0) as staff_used_hours,
      coalesce(sum(
        public.assignment_hours_in_range(
          a.start_date, a.end_date, a.hours_per_day, a.recurrence,
          a.recurrence_end_date, a.recurrence_exceptions,
          pm.range_start, least(p_as_of, pm.range_end)
        )
      ) filter (
        where pm.range_start <= least(p_as_of, pm.range_end)
          and r.kind = 'contractor_scheduled'
      ), 0) as contractor_sched_used_hours,
      coalesce(sum(
        public.assignment_hours_in_range(
          a.start_date, a.end_date, a.hours_per_day, a.recurrence,
          a.recurrence_end_date, a.recurrence_exceptions,
          greatest(p_as_of + 1, pm.range_start), pm.range_end
        )
      ) filter (
        where greatest(p_as_of + 1, pm.range_start) <= pm.range_end
          and r.kind = 'staff'
      ), 0) as staff_future_hours,
      coalesce(sum(
        public.assignment_hours_in_range(
          a.start_date, a.end_date, a.hours_per_day, a.recurrence,
          a.recurrence_end_date, a.recurrence_exceptions,
          greatest(p_as_of + 1, pm.range_start), pm.range_end
        )
      ) filter (
        where greatest(p_as_of + 1, pm.range_start) <= pm.range_end
          and r.kind = 'contractor_scheduled'
      ), 0) as contractor_sched_future_hours,
      coalesce(sum(
        public.assignment_hours_in_range(
          a.start_date, a.end_date, a.hours_per_day, a.recurrence,
          a.recurrence_end_date, a.recurrence_exceptions,
          pm.range_start, least(p_as_of, pm.range_end)
        ) * coalesce(r.cost_rate, 0)
      ) filter (
        where pm.range_start <= least(p_as_of, pm.range_end)
          and r.kind = 'staff'
      ), 0) as staff_used_amount,
      coalesce(sum(
        public.assignment_hours_in_range(
          a.start_date, a.end_date, a.hours_per_day, a.recurrence,
          a.recurrence_end_date, a.recurrence_exceptions,
          pm.range_start, least(p_as_of, pm.range_end)
        ) * coalesce(r.cost_rate, 0)
      ) filter (
        where pm.range_start <= least(p_as_of, pm.range_end)
          and r.kind = 'contractor_scheduled'
      ), 0) as contractor_sched_used_amount,
      coalesce(sum(
        public.assignment_hours_in_range(
          a.start_date, a.end_date, a.hours_per_day, a.recurrence,
          a.recurrence_end_date, a.recurrence_exceptions,
          greatest(p_as_of + 1, pm.range_start), pm.range_end
        ) * coalesce(r.cost_rate, 0)
      ) filter (
        where greatest(p_as_of + 1, pm.range_start) <= pm.range_end
          and r.kind = 'staff'
      ), 0) as staff_future_amount,
      coalesce(sum(
        public.assignment_hours_in_range(
          a.start_date, a.end_date, a.hours_per_day, a.recurrence,
          a.recurrence_end_date, a.recurrence_exceptions,
          greatest(p_as_of + 1, pm.range_start), pm.range_end
        ) * coalesce(r.cost_rate, 0)
      ) filter (
        where greatest(p_as_of + 1, pm.range_start) <= pm.range_end
          and r.kind = 'contractor_scheduled'
      ), 0) as contractor_sched_future_amount
    from project_months pm
    left join public.assignments a
      on a.project_id = pm.project_id
     and a.organization_id = pm.organization_id
     and a.status = 'confirmed'
    left join roster r
      on r.project_id = pm.project_id
     and r.person_id = a.person_id
     and r.kind in ('staff', 'contractor_scheduled')
    group by pm.project_id, pm.month_index
  ),
  expense_totals as (
    select
      pm.project_id,
      pm.month_index,
      coalesce(sum(
        case
          when coalesce(e.amount, 0) > 0 then e.amount
          else coalesce(e.hours, 0)
            * coalesce(nullif(pe.cost_rate, 0), os.default_cost_rate, 50)
        end
      ), 0) as expense_amount,
      coalesce(sum(
        case
          when coalesce(e.hours, 0) > 0 then e.hours
          when coalesce(nullif(pe.cost_rate, 0), os.default_cost_rate, 50) > 0
            then e.amount / coalesce(nullif(pe.cost_rate, 0), os.default_cost_rate, 50)
          else 0
        end
      ), 0) as expense_hours
    from project_months pm
    join public.projects proj on proj.id = pm.project_id
    join public.project_contractor_expenses e
      on e.project_id = pm.project_id
     and public.contractor_expense_applies_in_month(
       e.month_key,
       e.repeat_monthly,
       e.repeat_end_month,
       proj.start_date,
       proj.end_date,
       pm.month_date
     )
    join public.people pe
      on pe.id = e.person_id
     and pe.deleted_at is null
    join public.organization_settings os on os.organization_id = pe.organization_id
    group by pm.project_id, pm.month_index
  )
  select
    s.project_id,
    s.month_index,
    s.staff_used_hours
      + s.contractor_sched_used_hours
      + coalesce(x.expense_hours, 0),
    s.staff_future_hours + s.contractor_sched_future_hours,
    s.staff_used_amount
      + s.contractor_sched_used_amount
      + coalesce(x.expense_amount, 0),
    s.staff_future_amount + s.contractor_sched_future_amount,
    s.contractor_sched_used_hours + coalesce(x.expense_hours, 0),
    s.contractor_sched_future_hours,
    s.contractor_sched_used_amount + coalesce(x.expense_amount, 0),
    s.contractor_sched_future_amount
  from schedule_totals s
  left join expense_totals x
    on x.project_id = s.project_id
   and x.month_index = s.month_index;
$$;

revoke all on function public.rpc_monthly_retainer_year_bars(integer, date) from public;
grant execute on function public.rpc_monthly_retainer_year_bars(integer, date) to authenticated;
