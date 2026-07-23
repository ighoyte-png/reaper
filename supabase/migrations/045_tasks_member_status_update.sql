-- Let project members update any task on projects they belong to
-- (status changes from the board; other fields remain UI-gated).
drop policy if exists tasks_member_update on public.tasks;

create policy tasks_member_update on public.tasks for update
  using (
    organization_id = public.current_org_id()
    and public.current_role() = 'member'
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = tasks.project_id
        and pm.person_id = public.current_person_id()
    )
  )
  with check (
    organization_id = public.current_org_id()
    and public.current_role() = 'member'
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = tasks.project_id
        and pm.person_id = public.current_person_id()
    )
  );
