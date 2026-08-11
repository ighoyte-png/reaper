-- Platform workspace delete (service role) cascades people → tasks.assignee SET NULL.
-- That fires BEFORE UPDATE on tasks; protect_member_task_updates treated it because
-- current_role() is null under the service role (same class as 080).

create or replace function public.protect_member_task_updates()
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

  -- Service role / system writers (org delete cascades, admin APIs, etc.)
  if coalesce(auth.role(), '') = 'service_role' or auth.uid() is null then
    return new;
  end if;

  actor_role := public.current_role();
  if actor_role in ('admin', 'manager') then
    return new;
  end if;

  -- Project managers may fully edit their projects (existing RLS policies).
  if public.is_project_manager(old.project_id) then
    return new;
  end if;

  if new.organization_id is distinct from old.organization_id
    or new.project_id is distinct from old.project_id
    or new.list_id is distinct from old.list_id
    or new.parent_id is distinct from old.parent_id
    or new.assignee_person_id is distinct from old.assignee_person_id
    or new.title is distinct from old.title
    or new.start_date is distinct from old.start_date
    or new.due_date is distinct from old.due_date
    or new.notes is distinct from old.notes
    or new.sort_order is distinct from old.sort_order
    or new.created_by_profile_id is distinct from old.created_by_profile_id
  then
    raise exception 'project members may only update task status';
  end if;

  return new;
end;
$$;
