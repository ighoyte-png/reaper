-- People: hide from schedule/capacity; avatar initials color.
-- Profile role: managers may set member ↔ manager (not admin).
-- Project managers (manager_person_id) may edit their projects + related rows.

alter table public.people
  add column if not exists hide_from_schedule boolean not null default false;

alter table public.people
  add column if not exists avatar_color text;

-- Deterministic palette backfill for existing people (client PRESET_COLORS order).
with palette as (
  select array[
    '#E74C3C', '#FF6F00', '#FFC300', '#8BC34A',
    '#27AE60', '#3498DB', '#1976D2', '#212121',
    '#455A64', '#673AB7', '#F48FB1', '#00ACC1',
    '#00796B', '#8D6E63', '#A1887F', '#607D8B'
  ]::text[] as colors
)
update public.people p
set avatar_color = palette.colors[
  (mod(('x' || substr(md5(p.id::text), 1, 8))::bit(32)::int, 16) + 1)
]
from palette
where p.avatar_color is null or btrim(p.avatar_color) = '';

-- Managers can promote/demote between member and manager only.
drop policy if exists profiles_update_manager on public.profiles;
create policy profiles_update_manager on public.profiles for update
  using (
    organization_id = public.current_org_id()
    and public.current_role() = 'manager'
    and role in ('member', 'manager')
  )
  with check (
    organization_id = public.current_org_id()
    and public.current_role() = 'manager'
    and role in ('member', 'manager')
  );

-- True when the signed-in user is the assigned project manager.
create or replace function public.is_project_manager(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects pr
    join public.people pe on pe.id = pr.manager_person_id
    where pr.id = p_project_id
      and pe.profile_id = auth.uid()
      and pr.organization_id = public.current_org_id()
  );
$$;

revoke all on function public.is_project_manager(uuid) from public;
grant execute on function public.is_project_manager(uuid) to authenticated;

-- Project managers can update/delete projects they manage (insert still org managers).
drop policy if exists projects_write_as_pm on public.projects;
create policy projects_write_as_pm on public.projects for update
  using (
    organization_id = public.current_org_id()
    and public.is_project_manager(id)
  )
  with check (
    organization_id = public.current_org_id()
    and public.is_project_manager(id)
  );

drop policy if exists projects_delete_as_pm on public.projects;
create policy projects_delete_as_pm on public.projects for delete
  using (
    organization_id = public.current_org_id()
    and public.is_project_manager(id)
  );

drop policy if exists project_members_write_as_pm on public.project_members;
create policy project_members_write_as_pm on public.project_members for all
  using (
    organization_id = public.current_org_id()
    and public.is_project_manager(project_id)
  )
  with check (
    organization_id = public.current_org_id()
    and public.is_project_manager(project_id)
  );

-- PM may manage execution rows on their projects (when not already covered by org role).
drop policy if exists milestones_write_as_pm on public.milestones;
create policy milestones_write_as_pm on public.milestones for all
  using (
    organization_id = public.current_org_id()
    and public.is_project_manager(project_id)
  )
  with check (
    organization_id = public.current_org_id()
    and public.is_project_manager(project_id)
  );

drop policy if exists assignments_write_as_pm on public.assignments;
create policy assignments_write_as_pm on public.assignments for all
  using (
    organization_id = public.current_org_id()
    and public.is_project_manager(project_id)
  )
  with check (
    organization_id = public.current_org_id()
    and public.is_project_manager(project_id)
  );

drop policy if exists task_lists_write_as_pm on public.task_lists;
create policy task_lists_write_as_pm on public.task_lists for all
  using (
    organization_id = public.current_org_id()
    and public.is_project_manager(project_id)
  )
  with check (
    organization_id = public.current_org_id()
    and public.is_project_manager(project_id)
  );

drop policy if exists tasks_write_as_pm on public.tasks;
create policy tasks_write_as_pm on public.tasks for all
  using (
    organization_id = public.current_org_id()
    and public.is_project_manager(project_id)
  )
  with check (
    organization_id = public.current_org_id()
    and public.is_project_manager(project_id)
  );

drop policy if exists project_assets_write_as_pm on public.project_assets;
create policy project_assets_write_as_pm on public.project_assets for all
  using (
    organization_id = public.current_org_id()
    and public.is_project_manager(project_id)
  )
  with check (
    organization_id = public.current_org_id()
    and public.is_project_manager(project_id)
  );
