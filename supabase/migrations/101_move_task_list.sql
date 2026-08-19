-- Move a task list (and its tasks) to another project in the current org.

create or replace function public.move_task_list(
  p_list_id uuid,
  p_target_project_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  src_project uuid;
  src_org uuid;
  tgt_org uuid;
  actor public.app_role;
begin
  if p_list_id is null or p_target_project_id is null then
    raise exception 'List and target project are required';
  end if;

  select tl.project_id, tl.organization_id
    into src_project, src_org
  from public.task_lists tl
  where tl.id = p_list_id;

  if src_project is null then
    raise exception 'List not found';
  end if;

  if src_project = p_target_project_id then
    return;
  end if;

  select p.organization_id
    into tgt_org
  from public.projects p
  where p.id = p_target_project_id;

  if tgt_org is null then
    raise exception 'Target project not found';
  end if;

  if src_org is distinct from public.current_org_id()
    or tgt_org is distinct from public.current_org_id()
  then
    raise exception 'Not allowed';
  end if;

  actor := public.current_role();
  if actor is distinct from 'admin' and actor is distinct from 'manager' then
    if not public.is_project_manager(src_project)
      or not public.is_project_manager(p_target_project_id)
    then
      raise exception 'Not allowed';
    end if;
  end if;

  update public.task_lists
  set sort_order = sort_order + 1
  where project_id = p_target_project_id
    and archived = false;

  update public.task_lists
  set
    project_id = p_target_project_id,
    milestone_id = null,
    sort_order = 0
  where id = p_list_id;

  update public.tasks
  set project_id = p_target_project_id
  where list_id = p_list_id;
end;
$$;

revoke all on function public.move_task_list(uuid, uuid) from public;
grant execute on function public.move_task_list(uuid, uuid) to authenticated;
