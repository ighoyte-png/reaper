-- Add in-progress (active status) count for reports hub pie.
-- Due-date buckets exclude active tasks so slices stay mutually exclusive;
-- overdue still includes past-due actives (urgency wins).
-- Must DROP first: return type (OUT columns) cannot change via CREATE OR REPLACE.

drop function if exists public.rpc_org_task_stats(date);

create function public.rpc_org_task_stats(
  p_as_of date default current_date
)
returns table (
  open_count bigint,
  complete_count bigint,
  overdue_count bigint,
  no_due_count bigint,
  upcoming_count bigint,
  in_progress_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with org as (
    select public.current_org_id() as id
  ),
  scoped as (
    select t.status, t.due_date
    from public.tasks t
    join org on org.id = t.organization_id
  )
  select
    count(*) filter (where status is distinct from 'complete')::bigint as open_count,
    count(*) filter (where status = 'complete')::bigint as complete_count,
    count(*) filter (
      where status is distinct from 'complete'
        and due_date is not null
        and due_date < p_as_of
    )::bigint as overdue_count,
    count(*) filter (
      where status is distinct from 'complete'
        and status is distinct from 'active'
        and due_date is null
    )::bigint as no_due_count,
    count(*) filter (
      where status is distinct from 'complete'
        and status is distinct from 'active'
        and due_date is not null
        and due_date >= p_as_of
    )::bigint as upcoming_count,
    count(*) filter (
      where status = 'active'
        and (
          due_date is null
          or due_date >= p_as_of
        )
    )::bigint as in_progress_count
  from scoped;
$$;

revoke all on function public.rpc_org_task_stats(date) from public;
grant execute on function public.rpc_org_task_stats(date) to authenticated;
