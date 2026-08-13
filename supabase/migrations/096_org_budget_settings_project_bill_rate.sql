-- Org budget/rate settings, project bill_rate, cost-based amount burn, drop people.bill_rate.

create table if not exists public.organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  default_cost_rate numeric(10,2) not null default 50 check (default_cost_rate >= 0),
  default_bill_rate numeric(10,2) not null default 150 check (default_bill_rate >= 0),
  hours_warning_pct numeric(6,2) not null default 90 check (hours_warning_pct >= 0),
  hours_over_pct numeric(6,2) not null default 100 check (hours_over_pct > hours_warning_pct),
  target_profit_margin_pct numeric(6,2) not null default 25
    check (target_profit_margin_pct >= 0 and target_profit_margin_pct < 100),
  amount_warning_pct numeric(6,2) not null default 76 check (amount_warning_pct >= 0),
  amount_over_pct numeric(6,2) not null default 100 check (amount_over_pct > amount_warning_pct),
  capacity_low_max_pct numeric(6,2) not null default 60 check (capacity_low_max_pct >= 0),
  capacity_near_pct numeric(6,2) not null default 85 check (capacity_near_pct > capacity_low_max_pct),
  capacity_over_pct numeric(6,2) not null default 100 check (capacity_over_pct > capacity_near_pct),
  updated_at timestamptz not null default now()
);

alter table public.organization_settings enable row level security;

drop policy if exists organization_settings_select on public.organization_settings;
create policy organization_settings_select on public.organization_settings for select
  using (organization_id = public.current_org_id());

drop policy if exists organization_settings_write on public.organization_settings;
create policy organization_settings_write on public.organization_settings for all
  using (
    organization_id = public.current_org_id()
    and public.current_role() in ('admin', 'manager')
  )
  with check (
    organization_id = public.current_org_id()
    and public.current_role() in ('admin', 'manager')
  );

insert into public.organization_settings (organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;

alter table public.projects
  add column if not exists bill_rate numeric(10,2) null check (bill_rate is null or bill_rate >= 0);

-- Backfill hours-mode projects from assignment-weighted people.bill_rate, else default 150.
with weighted as (
  select
    a.project_id,
    sum(
      public.assignment_hours_in_range(
        a.start_date, a.end_date, a.hours_per_day, a.recurrence,
        a.recurrence_end_date, a.recurrence_exceptions,
        date '1970-01-01', date '2099-12-31'
      ) * pe.bill_rate
    ) as weighted_bill,
    sum(
      public.assignment_hours_in_range(
        a.start_date, a.end_date, a.hours_per_day, a.recurrence,
        a.recurrence_end_date, a.recurrence_exceptions,
        date '1970-01-01', date '2099-12-31'
      )
    ) filter (where pe.bill_rate > 0) as hours_with_rate
  from public.assignments a
  join public.people pe on pe.id = a.person_id and pe.deleted_at is null
  where a.status = 'confirmed'
  group by a.project_id
)
update public.projects p
set bill_rate = round(
  case
    when w.hours_with_rate is not null and w.hours_with_rate > 0
      then w.weighted_bill / w.hours_with_rate
    else coalesce(
      (
        select os.default_bill_rate
        from public.organization_settings os
        where os.organization_id = p.organization_id
      ),
      150
    )
  end,
  2
)
from weighted w
where w.project_id = p.id
  and p.budget_mode::text = 'hours'
  and p.bill_rate is null;

update public.projects p
set bill_rate = coalesce(
  (
    select os.default_bill_rate
    from public.organization_settings os
    where os.organization_id = p.organization_id
  ),
  150
)
where p.budget_mode::text = 'hours'
  and p.bill_rate is null;


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
      coalesce(sum(e.amount), 0) as expense_amount,
      coalesce(sum(
        case
          when coalesce(nullif(pe.cost_rate, 0), os.default_cost_rate, 50) > 0
            then e.amount / coalesce(nullif(pe.cost_rate, 0), os.default_cost_rate, 50)
          else 0
        end
      ), 0) as expense_hours
    from public.project_contractor_expenses e
    join project_ranges p
      on p.id = e.project_id
     and coalesce(p.budget_monthly_reset, false)
     and e.month_key = date_trunc('month', p_as_of)::date
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
      coalesce(sum(e.amount), 0) as expense_amount,
      coalesce(sum(
        case
          when coalesce(nullif(pe.cost_rate, 0), os.default_cost_rate, 50) > 0
            then e.amount / coalesce(nullif(pe.cost_rate, 0), os.default_cost_rate, 50)
          else 0
        end
      ), 0) as expense_hours
    from project_months pm
    join public.project_contractor_expenses e
      on e.project_id = pm.project_id
     and e.month_key = pm.month_date
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


-- Seed settings when a workspace is bootstrapped.
create or replace function public.bootstrap_organization(
  org_name text,
  user_full_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  user_email text;
  org_label text;
  org_slug text;
  n int := 2;
  allow_signup boolean;
  display_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if exists (
    select 1 from public.organization_memberships m where m.user_id = auth.uid()
  ) then
    return coalesce(
      public.current_org_id(),
      (
        select m.organization_id
        from public.organization_memberships m
        where m.user_id = auth.uid()
        order by m.created_at
        limit 1
      )
    );
  end if;

  select coalesce(allow_workspace_signup, true)
  into allow_signup
  from public.app_settings
  where id = 1;

  if allow_signup is distinct from true then
    raise exception 'Workspace creation is disabled';
  end if;

  user_email := coalesce(auth.jwt() ->> 'email', '');
  display_name := coalesce(
    nullif(trim(user_full_name), ''),
    split_part(user_email, '@', 1),
    'Owner'
  );
  org_label := coalesce(nullif(trim(org_name), ''), 'My workspace');
  org_slug := nullif(public.slugify(org_label), '');
  if org_slug is null or org_slug = '' then
    org_slug := 'workspace';
  end if;
  while exists (select 1 from public.organizations where slug = org_slug) loop
    org_slug := coalesce(nullif(public.slugify(org_label), ''), 'workspace') || '-' || n;
    n := n + 1;
  end loop;

  insert into public.organizations (name, slug)
  values (org_label, org_slug)
  returning id into new_org_id;

  insert into public.organization_settings (organization_id)
  values (new_org_id)
  on conflict (organization_id) do nothing;

  insert into public.profiles (id, organization_id, email, full_name, role)
  values (
    auth.uid(),
    new_org_id,
    user_email,
    display_name,
    'admin'
  )
  on conflict (id) do update
    set organization_id = excluded.organization_id,
        email = excluded.email,
        full_name = excluded.full_name,
        role = excluded.role;

  insert into public.organization_memberships (user_id, organization_id, role)
  values (auth.uid(), new_org_id, 'admin')
  on conflict (user_id, organization_id) do update
    set role = excluded.role;

  insert into public.user_active_organization (user_id, organization_id, updated_at)
  values (auth.uid(), new_org_id, now())
  on conflict (user_id) do update
    set organization_id = excluded.organization_id,
        updated_at = now();

  return new_org_id;
end;
$$;

grant execute on function public.bootstrap_organization(text, text) to authenticated;

-- Also seed settings for create_additional_organization when present.
create or replace function public.ensure_organization_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organization_settings (organization_id)
  values (new.id)
  on conflict (organization_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_organizations_settings on public.organizations;
create trigger trg_organizations_settings
  after insert on public.organizations
  for each row
  execute function public.ensure_organization_settings();

-- Protect people self-update without bill_rate column.
create or replace function public.protect_people_self_update_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.app_role;
begin
  if TG_OP <> 'UPDATE' then
    return new;
  end if;

  actor_role := public.current_role();
  if actor_role in ('admin', 'manager') then
    return new;
  end if;

  if new.profile_id is distinct from old.profile_id
    or new.organization_id is distinct from old.organization_id
    or new.name is distinct from old.name
    or new.role_title is distinct from old.role_title
    or new.department is distinct from old.department
    or new.office is distinct from old.office
    or new.capacity_hours_week is distinct from old.capacity_hours_week
    or new.cost_rate is distinct from old.cost_rate
    or new.timezone is distinct from old.timezone
    or new.email is distinct from old.email
    or coalesce(new.hide_from_schedule, false) is distinct from coalesce(old.hide_from_schedule, false)
    or coalesce(new.hide_from_utilization, false) is distinct from coalesce(old.hide_from_utilization, false)
    or coalesce(new.is_contractor, false) is distinct from coalesce(old.is_contractor, false)
    or new.holiday_calendar_id is distinct from old.holiday_calendar_id
  then
    raise exception 'members may only update avatar fields on their own people row';
  end if;

  return new;
end;
$$;

alter table public.people drop column if exists bill_rate;
