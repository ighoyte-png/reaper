-- Org-wide monthly-retainer year bars (hours mode + monthly reset).
-- Mirrors client calendarYearBars / monthBurnSplit with contractor terms,
-- without loading all assignments into the browser.

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
      and p.budget_mode::text = 'hours'
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
      to_char(make_date(p_year, m.month_index + 1, 1), 'YYYY-MM') as month_key
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
      case
        when coalesce(pe.cost_rate, 0) > 0 then pe.cost_rate
        when coalesce(pe.bill_rate, 0) > 0 then pe.bill_rate
        else 0::numeric
      end as profile_rate,
      pe.bill_rate,
      pm.contractor_fixed_fee,
      pm.contractor_hours
    from roster_ids r
    join public.people pe
      on pe.id = r.person_id
     and pe.deleted_at is null
    join projects_monthly p on p.id = r.project_id
     and pe.organization_id = p.organization_id
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
        ) * coalesce(r.bill_rate, 0)
      ) filter (
        where pm.range_start <= least(p_as_of, pm.range_end)
          and r.kind = 'staff'
      ), 0) as staff_used_amount,
      coalesce(sum(
        public.assignment_hours_in_range(
          a.start_date, a.end_date, a.hours_per_day, a.recurrence,
          a.recurrence_end_date, a.recurrence_exceptions,
          pm.range_start, least(p_as_of, pm.range_end)
        ) * coalesce(r.bill_rate, 0)
      ) filter (
        where pm.range_start <= least(p_as_of, pm.range_end)
          and r.kind = 'contractor_scheduled'
      ), 0) as contractor_sched_used_amount,
      coalesce(sum(
        public.assignment_hours_in_range(
          a.start_date, a.end_date, a.hours_per_day, a.recurrence,
          a.recurrence_end_date, a.recurrence_exceptions,
          greatest(p_as_of + 1, pm.range_start), pm.range_end
        ) * coalesce(r.bill_rate, 0)
      ) filter (
        where greatest(p_as_of + 1, pm.range_start) <= pm.range_end
          and r.kind = 'staff'
      ), 0) as staff_future_amount,
      coalesce(sum(
        public.assignment_hours_in_range(
          a.start_date, a.end_date, a.hours_per_day, a.recurrence,
          a.recurrence_end_date, a.recurrence_exceptions,
          greatest(p_as_of + 1, pm.range_start), pm.range_end
        ) * coalesce(r.bill_rate, 0)
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
  commit_totals as (
    select
      pm.project_id,
      pm.month_index,
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
    from project_months pm
    join roster r
      on r.project_id = pm.project_id
     and r.kind in ('commit_fee', 'commit_hours')
    where pm.month_key = pm.commit_month_key
    group by pm.project_id, pm.month_index
  )
  select
    s.project_id,
    s.month_index,
    s.staff_used_hours as used_hours,
    s.staff_future_hours as future_hours,
    s.staff_used_amount as used_amount,
    s.staff_future_amount as future_amount,
    s.contractor_sched_used_hours
      + coalesce(c.commit_used_hours, 0) as contractor_used_hours,
    s.contractor_sched_future_hours as contractor_future_hours,
    s.contractor_sched_used_amount
      + coalesce(c.commit_used_amount, 0) as contractor_used_amount,
    s.contractor_sched_future_amount as contractor_future_amount
  from schedule_totals s
  left join commit_totals c
    on c.project_id = s.project_id
   and c.month_index = s.month_index
  order by s.project_id, s.month_index;
$$;

revoke all on function public.rpc_monthly_retainer_year_bars(integer, date) from public;
grant execute on function public.rpc_monthly_retainer_year_bars(integer, date) to authenticated;
