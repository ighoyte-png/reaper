-- Align rpc_project_budget_burns with client budgetBurn contractor math:
-- - Exclude fixed-fee / hours commitment contractors from schedule sums
-- - Add their roster commitments as used
-- - Return contractor split fields for burn-bar green/blue segments

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
     and pe.organization_id = (
       select pr.organization_id from project_ranges pr where pr.id = r.project_id
     )
     and pe.deleted_at is null
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
        ) * coalesce(r.bill_rate, 0)
      ) filter (
        where p.range_start <= least(p_as_of, p.range_end)
          and r.kind = 'staff'
      ), 0) as staff_used_amount,
      coalesce(sum(
        public.assignment_hours_in_range(
          a.start_date, a.end_date, a.hours_per_day, a.recurrence,
          a.recurrence_end_date, a.recurrence_exceptions,
          p.range_start, least(p_as_of, p.range_end)
        ) * coalesce(r.bill_rate, 0)
      ) filter (
        where p.range_start <= least(p_as_of, p.range_end)
          and r.kind = 'contractor_scheduled'
      ), 0) as contractor_sched_used_amount,
      coalesce(sum(
        public.assignment_hours_in_range(
          a.start_date, a.end_date, a.hours_per_day, a.recurrence,
          a.recurrence_end_date, a.recurrence_exceptions,
          greatest(p_as_of + 1, p.range_start), p.range_end
        ) * coalesce(r.bill_rate, 0)
      ) filter (
        where greatest(p_as_of + 1, p.range_start) <= p.range_end
          and r.kind = 'staff'
      ), 0) as staff_future_amount,
      coalesce(sum(
        public.assignment_hours_in_range(
          a.start_date, a.end_date, a.hours_per_day, a.recurrence,
          a.recurrence_end_date, a.recurrence_exceptions,
          greatest(p_as_of + 1, p.range_start), p.range_end
        ) * coalesce(r.bill_rate, 0)
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
    where r.kind in ('commit_fee', 'commit_hours')
    group by r.project_id
  ),
  totals as (
    select
      s.id,
      s.budget_hours,
      s.budget_amount,
      s.normalized_mode,
      s.staff_used_hours
        + s.contractor_sched_used_hours
        + coalesce(c.commit_used_hours, 0) as used_hours,
      s.staff_future_hours
        + s.contractor_sched_future_hours as future_hours,
      s.staff_used_amount
        + s.contractor_sched_used_amount
        + coalesce(c.commit_used_amount, 0) as used_amount,
      s.staff_future_amount
        + s.contractor_sched_future_amount as future_amount,
      s.contractor_sched_used_hours
        + coalesce(c.commit_used_hours, 0) as contractor_used_hours,
      s.contractor_sched_future_hours as contractor_future_hours,
      s.contractor_sched_used_amount
        + coalesce(c.commit_used_amount, 0) as contractor_used_amount,
      s.contractor_sched_future_amount as contractor_future_amount
    from schedule_totals s
    left join commit_totals c on c.project_id = s.id
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
