-- Undated milestones (template apply leaves dates for the user to set)
alter table public.milestones
  alter column due_date drop not null;

-- Include project templates when wiping org data for demo seed
create or replace function public.clear_organization_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid;
  r public.app_role;
begin
  org := public.current_org_id();
  r := public.current_role();
  if org is null then
    raise exception 'No organization';
  end if;
  if r is distinct from 'admin' and r is distinct from 'manager' then
    raise exception 'Not allowed';
  end if;

  -- Templates (not cascaded from projects)
  delete from public.template_tasks where organization_id = org;
  delete from public.template_task_lists where organization_id = org;
  delete from public.template_milestones where organization_id = org;
  delete from public.project_templates where organization_id = org;

  delete from public.assignments where organization_id = org;
  delete from public.leave_days where organization_id = org;
  delete from public.milestones where organization_id = org;
  delete from public.projects where organization_id = org;
  delete from public.clients where organization_id = org;
  update public.people set holiday_calendar_id = null where organization_id = org;
  delete from public.people where organization_id = org;
  delete from public.holiday_calendar_days where organization_id = org;
  delete from public.holiday_calendars where organization_id = org;
end;
$$;
