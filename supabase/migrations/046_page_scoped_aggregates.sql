-- Page-scoped aggregates for budget, forecast, and utilization views.
-- All RPCs are SECURITY INVOKER and explicitly scope their source rows to
-- current_org_id(), so normal RLS policies remain in effect.

create or replace function public.working_days_between(
  p_from_date date,
  p_to_date date
)
returns int
language sql
immutable
strict
parallel safe
as $$
  select count(*)::int
  from generate_series(p_from_date, p_to_date, interval '1 day') as d(day)
  where extract(isodow from d.day) between 1 and 5;
$$;

create or replace function public.week_start_monday(p_date date)
returns date
language sql
immutable
strict
parallel safe
as $$
  select (p_date - (extract(isodow from p_date)::int - 1));
$$;

-- Returns working-day hours from one assignment that overlap an inclusive range.
-- Indefinite weekly series are limited to the 52-week budgeting horizon.
create or replace function public.assignment_hours_in_range(
  p_start_date date,
  p_end_date date,
  p_hours_per_day numeric,
  p_recurrence text,
  p_recurrence_end_date date,
  p_recurrence_exceptions text[],
  p_range_start date,
  p_range_end date
)
returns numeric
language sql
immutable
parallel safe
as $$
  with occurrences as (
    select p_start_date as occurrence_start, p_end_date as occurrence_end
    where coalesce(p_recurrence, 'none') <> 'weekly'

    union all

    select
      p_start_date + (week_offset * 7),
      least(
        p_end_date + (week_offset * 7),
        coalesce(p_recurrence_end_date, p_end_date + (week_offset * 7))
      )
    from generate_series(
      0,
      case
        when p_recurrence_end_date is null then 51
        else greatest(0, floor((p_recurrence_end_date - p_start_date) / 7.0)::int)
      end
    ) as week_offset
    where coalesce(p_recurrence, 'none') = 'weekly'
      and p_start_date + (week_offset * 7) <= coalesce(p_recurrence_end_date, 'infinity'::date)
      and not (
        public.week_start_monday(p_start_date + (week_offset * 7))::text
          = any(coalesce(p_recurrence_exceptions, '{}'::text[]))
      )
  )
  select coalesce(
    sum(
      public.working_days_between(
        greatest(occurrence_start, p_range_start),
        least(occurrence_end, p_range_end)
      ) * p_hours_per_day
    ) filter (
      where occurrence_start <= p_range_end
        and occurrence_end >= p_range_start
    ),
    0
  )
  from occurrences;
$$;

create or replace function public.rpc_project_budget_burns(
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
  amount_over_by numeric
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
        when p.budget_mode::text = 'hours' and p.budget_monthly_reset
          then date_trunc('month', p_as_of)::date
        else date '1970-01-01'
      end as range_start,
      case
        when p.budget_mode::text = 'hours' and p.budget_monthly_reset
          then (date_trunc('month', p_as_of) + interval '1 month - 1 day')::date
        else date '2099-12-31'
      end as range_end
    from public.projects p
    join org on org.id = p.organization_id
  ),
  totals as (
    select
      p.id,
      p.organization_id,
      p.budget_hours,
      p.budget_amount,
      p.normalized_mode,
      p.range_start,
      p.range_end,
      coalesce(sum(
        public.assignment_hours_in_range(
          a.start_date, a.end_date, a.hours_per_day, a.recurrence,
          a.recurrence_end_date, a.recurrence_exceptions,
          p.range_start, least(p_as_of, p.range_end)
        )
      ) filter (where p.range_start <= least(p_as_of, p.range_end)), 0) as used_hours,
      coalesce(sum(
        public.assignment_hours_in_range(
          a.start_date, a.end_date, a.hours_per_day, a.recurrence,
          a.recurrence_end_date, a.recurrence_exceptions,
          greatest(p_as_of + 1, p.range_start), p.range_end
        )
      ) filter (where greatest(p_as_of + 1, p.range_start) <= p.range_end), 0) as future_hours,
      coalesce(sum(
        public.assignment_hours_in_range(
          a.start_date, a.end_date, a.hours_per_day, a.recurrence,
          a.recurrence_end_date, a.recurrence_exceptions,
          p.range_start, least(p_as_of, p.range_end)
        ) * coalesce(person.bill_rate, 0)
      ) filter (where p.range_start <= least(p_as_of, p.range_end)), 0) as used_amount,
      coalesce(sum(
        public.assignment_hours_in_range(
          a.start_date, a.end_date, a.hours_per_day, a.recurrence,
          a.recurrence_end_date, a.recurrence_exceptions,
          greatest(p_as_of + 1, p.range_start), p.range_end
        ) * coalesce(person.bill_rate, 0)
      ) filter (where greatest(p_as_of + 1, p.range_start) <= p.range_end), 0) as future_amount
    from project_ranges p
    left join public.assignments a
      on a.project_id = p.id
      and a.organization_id = p.organization_id
      and a.status = 'confirmed'
    left join public.people person
      on person.id = a.person_id
      and person.organization_id = p.organization_id
    group by
      p.id,
      p.organization_id,
      p.budget_hours,
      p.budget_amount,
      p.normalized_mode,
      p.range_start,
      p.range_end
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
      then greatest(0, used_amount + future_amount - coalesce(budget_amount, 0)) else 0 end
  from totals;
$$;

create or replace function public.rpc_org_forecast(
  p_as_of date default current_date
)
returns table (
  project_id uuid,
  planned_hours numeric,
  revenue numeric,
  cost numeric,
  margin numeric,
  margin_pct numeric,
  hours_used_to_date numeric,
  hours_future_planned numeric,
  hours_remaining numeric,
  budget_margin numeric,
  budget_margin_pct numeric,
  over_budget boolean
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
      case when p.budget_mode::text = 'hours' and p.budget_monthly_reset
        then date_trunc('month', p_as_of)::date else date '1970-01-01' end as range_start,
      case when p.budget_mode::text = 'hours' and p.budget_monthly_reset
        then (date_trunc('month', p_as_of) + interval '1 month - 1 day')::date
        else date '2099-12-31' end as range_end
    from public.projects p
    join org on org.id = p.organization_id
  ),
  project_values as (
    select
      p.id as project_id,
      p.normalized_mode,
      p.budget_hours,
      p.budget_amount,
      coalesce(sum(public.assignment_hours_in_range(
        a.start_date, a.end_date, a.hours_per_day, a.recurrence,
        a.recurrence_end_date, a.recurrence_exceptions,
        date '1970-01-01',
        case when a.recurrence = 'weekly'
          then coalesce(a.recurrence_end_date, a.start_date + 51 * 7)
          else a.end_date end
      )), 0) as planned_hours,
      coalesce(sum(public.assignment_hours_in_range(
        a.start_date, a.end_date, a.hours_per_day, a.recurrence,
        a.recurrence_end_date, a.recurrence_exceptions,
        date '1970-01-01',
        case when a.recurrence = 'weekly'
          then coalesce(a.recurrence_end_date, a.start_date + 51 * 7)
          else a.end_date end
      ) * coalesce(person.bill_rate, 0)), 0) as revenue,
      coalesce(sum(public.assignment_hours_in_range(
        a.start_date, a.end_date, a.hours_per_day, a.recurrence,
        a.recurrence_end_date, a.recurrence_exceptions,
        date '1970-01-01',
        case when a.recurrence = 'weekly'
          then coalesce(a.recurrence_end_date, a.start_date + 51 * 7)
          else a.end_date end
      ) * coalesce(person.cost_rate, 0)), 0) as cost,
      coalesce(sum(public.assignment_hours_in_range(
        a.start_date, a.end_date, a.hours_per_day, a.recurrence,
        a.recurrence_end_date, a.recurrence_exceptions,
        p.range_start, least(p_as_of, p.range_end)
      )) filter (where p.range_start <= least(p_as_of, p.range_end)), 0) as hours_used_to_date,
      coalesce(sum(public.assignment_hours_in_range(
        a.start_date, a.end_date, a.hours_per_day, a.recurrence,
        a.recurrence_end_date, a.recurrence_exceptions,
        greatest(p_as_of + 1, p.range_start), p.range_end
      )) filter (where greatest(p_as_of + 1, p.range_start) <= p.range_end), 0) as hours_future_planned
    from project_ranges p
    left join public.assignments a
      on a.project_id = p.id and a.organization_id = p.organization_id
      and a.status = 'confirmed'
    left join public.people person
      on person.id = a.person_id and person.organization_id = p.organization_id
    group by p.id, p.normalized_mode, p.budget_hours, p.budget_amount, p.range_start, p.range_end
  ),
  rows as (
    select
      project_id, planned_hours, revenue, cost, revenue - cost as margin,
      case when revenue > 0 then ((revenue - cost) / revenue) * 100 else 0 end as margin_pct,
      hours_used_to_date, hours_future_planned,
      case when normalized_mode = 'hours'
        then coalesce(budget_hours, 0) - (hours_used_to_date + hours_future_planned)
      end as hours_remaining,
      case when normalized_mode = 'amount' then coalesce(budget_amount, 0) - cost
           when normalized_mode = 'hours' then
             (coalesce(budget_hours, 0) - (hours_used_to_date + hours_future_planned))
             * case when planned_hours > 0 then cost / planned_hours else 0 end
      end as budget_margin,
      case when normalized_mode = 'amount' and coalesce(budget_amount, 0) > 0
             then ((coalesce(budget_amount, 0) - cost) / budget_amount) * 100
           when normalized_mode = 'hours' and coalesce(budget_hours, 0) > 0
             then ((budget_hours - (hours_used_to_date + hours_future_planned)) / budget_hours) * 100
      end as budget_margin_pct,
      case when normalized_mode = 'hours' then
             hours_used_to_date + hours_future_planned > coalesce(budget_hours, 0)
             and coalesce(budget_hours, 0) > 0
           when normalized_mode = 'amount' then revenue > coalesce(budget_amount, 0)
             and coalesce(budget_amount, 0) > 0
           else false end as over_budget
    from project_values
  )
  select * from rows
  union all
  select
    null::uuid,
    coalesce(sum(planned_hours), 0),
    coalesce(sum(revenue), 0),
    coalesce(sum(cost), 0),
    coalesce(sum(margin), 0),
    case when coalesce(sum(revenue), 0) > 0
      then ((sum(revenue) - sum(cost)) / sum(revenue)) * 100 else 0 end,
    coalesce(sum(hours_used_to_date), 0),
    coalesce(sum(hours_future_planned), 0),
    coalesce(sum(hours_remaining), 0),
    coalesce(sum(budget_margin), 0),
    null::numeric,
    coalesce(bool_or(over_budget), false)
  from rows
  cross join org
  where org.id is not null;
$$;

create or replace function public.rpc_person_utilization_weeks(
  p_week_start date,
  p_weeks int,
  p_person_ids uuid[] default null
)
returns table (
  person_id uuid,
  week_start date,
  booked_hours numeric,
  available_hours numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with org as (
    select public.current_org_id() as id
  ),
  weeks as (
    select p_week_start + (i * 7) as week_start
    from generate_series(0, greatest(coalesce(p_weeks, 0) - 1, -1)) as i
  ),
  selected_people as (
    select p.id, p.organization_id, p.capacity_hours_week
    from public.people p
    join org on org.id = p.organization_id
    where p_person_ids is null or p.id = any(p_person_ids)
  ),
  person_days as (
    select
      p.id as person_id,
      p.organization_id,
      w.week_start,
      d.day::date as day,
      p.capacity_hours_week / 5 as capacity_per_day
    from selected_people p
    cross join weeks w
    cross join lateral generate_series(w.week_start, w.week_start + 4, interval '1 day') as d(day)
  )
  select
    d.person_id,
    d.week_start,
    coalesce(sum(
      case when full_leave.id is not null then 0
        else coalesce(partial_leave.hours_per_day, 0)
          + coalesce((
            select sum(public.assignment_hours_in_range(
              a.start_date, a.end_date, a.hours_per_day, a.recurrence,
              a.recurrence_end_date, a.recurrence_exceptions, d.day, d.day
            ))
            from public.assignments a
            where a.organization_id = d.organization_id
              and a.person_id = d.person_id
              and a.status in ('confirmed', 'tentative')
          ), 0)
      end
    ), 0) as booked_hours,
    coalesce(sum(case when full_leave.id is null then d.capacity_per_day else 0 end), 0) as available_hours
  from person_days d
  left join public.leave_days full_leave
    on full_leave.organization_id = d.organization_id
    and full_leave.person_id = d.person_id
    and full_leave.date = d.day
    and full_leave.status = 'approved'
    and full_leave.hours_per_day is null
  left join public.leave_days partial_leave
    on partial_leave.organization_id = d.organization_id
    and partial_leave.person_id = d.person_id
    and partial_leave.date = d.day
    and partial_leave.status = 'approved'
    and partial_leave.hours_per_day is not null
  group by d.person_id, d.week_start;
$$;

revoke all on function public.working_days_between(date, date) from public;
revoke all on function public.week_start_monday(date) from public;
revoke all on function public.assignment_hours_in_range(date, date, numeric, text, date, text[], date, date) from public;
revoke all on function public.rpc_project_budget_burns(date) from public;
revoke all on function public.rpc_org_forecast(date) from public;
revoke all on function public.rpc_person_utilization_weeks(date, int, uuid[]) from public;

grant execute on function public.working_days_between(date, date) to authenticated;
grant execute on function public.week_start_monday(date) to authenticated;
grant execute on function public.assignment_hours_in_range(date, date, numeric, text, date, text[], date, date) to authenticated;
grant execute on function public.rpc_project_budget_burns(date) to authenticated;
grant execute on function public.rpc_org_forecast(date) to authenticated;
grant execute on function public.rpc_person_utilization_weeks(date, int, uuid[]) to authenticated;
