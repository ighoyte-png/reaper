-- Security hardening: profile/role immutability, column-scoped member updates,
-- bulletin audience RLS, disabled orgs, same-tenant checks, storage policies,
-- and complete clear_organization_data.

-- ---------------------------------------------------------------------------
-- Helpers: active org only
-- ---------------------------------------------------------------------------
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.organization_id
  from public.profiles p
  join public.organizations o on o.id = p.organization_id
  where p.id = auth.uid()
    and o.disabled_at is null
$$;

create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  join public.organizations o on o.id = p.organization_id
  where p.id = auth.uid()
    and o.disabled_at is null
$$;

create or replace function public.current_person_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select pe.id
  from public.people pe
  join public.profiles p on p.id = pe.profile_id
  join public.organizations o on o.id = p.organization_id
  where pe.profile_id = auth.uid()
    and o.disabled_at is null
  limit 1
$$;

revoke all on function public.current_org_id() from public;
revoke all on function public.current_role() from public;
revoke all on function public.current_person_id() from public;
grant execute on function public.current_org_id() to authenticated;
grant execute on function public.current_role() to authenticated;
grant execute on function public.current_person_id() to authenticated;

-- ---------------------------------------------------------------------------
-- Profiles: block self-escalation of role / organization_id
-- ---------------------------------------------------------------------------
drop policy if exists profiles_update_self on public.profiles;

-- Members may update only their own display fields; privileged columns blocked by trigger.
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid() and organization_id = public.current_org_id())
  with check (id = auth.uid() and organization_id = public.current_org_id());

create or replace function public.protect_profile_privileged_columns()
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

  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id cannot be changed';
  end if;

  if new.role is distinct from old.role then
    actor_role := public.current_role();
    if actor_role = 'admin' then
      null;
    elsif actor_role = 'manager'
      and old.role in ('member', 'manager')
      and new.role in ('member', 'manager')
    then
      null;
    else
      raise exception 'role cannot be changed';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_profile_privileged_columns on public.profiles;
create trigger trg_protect_profile_privileged_columns
  before update on public.profiles
  for each row
  execute function public.protect_profile_privileged_columns();

-- ---------------------------------------------------------------------------
-- People: self-update only avatar fields
-- ---------------------------------------------------------------------------
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

  -- Members may only change avatar fields on their linked row.
  if new.profile_id is distinct from old.profile_id
    or new.organization_id is distinct from old.organization_id
    or new.name is distinct from old.name
    or new.role_title is distinct from old.role_title
    or new.department is distinct from old.department
    or new.office is distinct from old.office
    or new.capacity_hours_week is distinct from old.capacity_hours_week
    or new.cost_rate is distinct from old.cost_rate
    or new.bill_rate is distinct from old.bill_rate
    or new.timezone is distinct from old.timezone
    or new.email is distinct from old.email
    or coalesce(new.hide_from_schedule, false) is distinct from coalesce(old.hide_from_schedule, false)
    or new.holiday_calendar_id is distinct from old.holiday_calendar_id
  then
    raise exception 'members may only update avatar fields on their own people row';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_people_self_update_columns on public.people;
create trigger trg_protect_people_self_update_columns
  before update on public.people
  for each row
  execute function public.protect_people_self_update_columns();

-- ---------------------------------------------------------------------------
-- Tasks: project members may change status (+ audit cols) only
-- ---------------------------------------------------------------------------
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

drop trigger if exists trg_protect_member_task_updates on public.tasks;
create trigger trg_protect_member_task_updates
  before update on public.tasks
  for each row
  execute function public.protect_member_task_updates();

-- Keep roster membership policy; trigger enforces status-only for members.
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

-- ---------------------------------------------------------------------------
-- Bulletins: audience enforced in SELECT
-- ---------------------------------------------------------------------------
drop policy if exists bulletins_select on public.bulletins;
create policy bulletins_select on public.bulletins for select
  using (
    organization_id = public.current_org_id()
    and (
      public.current_role() in ('admin', 'manager')
      or coalesce(audience, 'all') = 'all'
      or (
        audience = 'people'
        and public.current_person_id() is not null
        and public.current_person_id() = any (coalesce(audience_person_ids, '{}'::uuid[]))
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Mention unreads: no self-insert without authorship
-- ---------------------------------------------------------------------------
drop policy if exists mention_unreads_insert on public.mention_unreads;
create policy mention_unreads_insert on public.mention_unreads for insert
  with check (
    organization_id = public.current_org_id()
    and (
      exists (
        select 1
        from public.task_comments c
        where c.id = comment_id
          and c.organization_id = organization_id
          and c.author_profile_id = auth.uid()
      )
      or public.current_role() in ('admin', 'manager')
    )
  );

-- ---------------------------------------------------------------------------
-- Same-tenant relationship checks
-- ---------------------------------------------------------------------------
create or replace function public.assert_same_org_ref(
  p_org uuid,
  p_table text,
  p_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ref_org uuid;
begin
  if p_id is null then
    return;
  end if;
  execute format(
    'select organization_id from public.%I where id = $1',
    p_table
  ) into ref_org using p_id;
  if ref_org is null then
    raise exception 'referenced % % not found', p_table, p_id;
  end if;
  if ref_org is distinct from p_org then
    raise exception 'cross-tenant reference rejected for %.%', p_table, p_id;
  end if;
end;
$$;

create or replace function public.enforce_row_same_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_TABLE_NAME = 'assignments' then
    perform public.assert_same_org_ref(new.organization_id, 'people', new.person_id);
    perform public.assert_same_org_ref(new.organization_id, 'projects', new.project_id);
  elsif TG_TABLE_NAME = 'leave_days' then
    perform public.assert_same_org_ref(new.organization_id, 'people', new.person_id);
  elsif TG_TABLE_NAME = 'milestones' then
    perform public.assert_same_org_ref(new.organization_id, 'projects', new.project_id);
  elsif TG_TABLE_NAME = 'project_assets' then
    perform public.assert_same_org_ref(new.organization_id, 'projects', new.project_id);
  elsif TG_TABLE_NAME = 'task_lists' then
    perform public.assert_same_org_ref(new.organization_id, 'projects', new.project_id);
    if new.milestone_id is not null then
      perform public.assert_same_org_ref(new.organization_id, 'milestones', new.milestone_id);
    end if;
  elsif TG_TABLE_NAME = 'tasks' then
    perform public.assert_same_org_ref(new.organization_id, 'projects', new.project_id);
    perform public.assert_same_org_ref(new.organization_id, 'task_lists', new.list_id);
    if new.parent_id is not null then
      perform public.assert_same_org_ref(new.organization_id, 'tasks', new.parent_id);
    end if;
    if new.assignee_person_id is not null then
      perform public.assert_same_org_ref(new.organization_id, 'people', new.assignee_person_id);
    end if;
  elsif TG_TABLE_NAME = 'task_comments' then
    perform public.assert_same_org_ref(new.organization_id, 'tasks', new.task_id);
  elsif TG_TABLE_NAME = 'project_members' then
    perform public.assert_same_org_ref(new.organization_id, 'projects', new.project_id);
    perform public.assert_same_org_ref(new.organization_id, 'people', new.person_id);
  elsif TG_TABLE_NAME = 'pod_members' then
    perform public.assert_same_org_ref(new.organization_id, 'pods', new.pod_id);
    perform public.assert_same_org_ref(new.organization_id, 'people', new.person_id);
  elsif TG_TABLE_NAME = 'template_milestones' then
    perform public.assert_same_org_ref(new.organization_id, 'project_templates', new.template_id);
  elsif TG_TABLE_NAME = 'template_task_lists' then
    perform public.assert_same_org_ref(new.organization_id, 'project_templates', new.template_id);
  elsif TG_TABLE_NAME = 'template_tasks' then
    perform public.assert_same_org_ref(new.organization_id, 'project_templates', new.template_id);
    perform public.assert_same_org_ref(new.organization_id, 'template_task_lists', new.list_id);
  elsif TG_TABLE_NAME = 'projects' then
    if new.client_id is not null then
      perform public.assert_same_org_ref(new.organization_id, 'clients', new.client_id);
    end if;
    if new.manager_person_id is not null then
      perform public.assert_same_org_ref(new.organization_id, 'people', new.manager_person_id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assignments_same_org on public.assignments;
create trigger trg_assignments_same_org
  before insert or update on public.assignments
  for each row execute function public.enforce_row_same_org();

drop trigger if exists trg_leave_days_same_org on public.leave_days;
create trigger trg_leave_days_same_org
  before insert or update on public.leave_days
  for each row execute function public.enforce_row_same_org();

drop trigger if exists trg_milestones_same_org on public.milestones;
create trigger trg_milestones_same_org
  before insert or update on public.milestones
  for each row execute function public.enforce_row_same_org();

drop trigger if exists trg_project_assets_same_org on public.project_assets;
create trigger trg_project_assets_same_org
  before insert or update on public.project_assets
  for each row execute function public.enforce_row_same_org();

drop trigger if exists trg_task_lists_same_org on public.task_lists;
create trigger trg_task_lists_same_org
  before insert or update on public.task_lists
  for each row execute function public.enforce_row_same_org();

drop trigger if exists trg_tasks_same_org on public.tasks;
create trigger trg_tasks_same_org
  before insert or update on public.tasks
  for each row execute function public.enforce_row_same_org();

drop trigger if exists trg_task_comments_same_org on public.task_comments;
create trigger trg_task_comments_same_org
  before insert or update on public.task_comments
  for each row execute function public.enforce_row_same_org();

drop trigger if exists trg_project_members_same_org on public.project_members;
create trigger trg_project_members_same_org
  before insert or update on public.project_members
  for each row execute function public.enforce_row_same_org();

drop trigger if exists trg_pod_members_same_org on public.pod_members;
create trigger trg_pod_members_same_org
  before insert or update on public.pod_members
  for each row execute function public.enforce_row_same_org();

drop trigger if exists trg_template_milestones_same_org on public.template_milestones;
create trigger trg_template_milestones_same_org
  before insert or update on public.template_milestones
  for each row execute function public.enforce_row_same_org();

drop trigger if exists trg_template_task_lists_same_org on public.template_task_lists;
create trigger trg_template_task_lists_same_org
  before insert or update on public.template_task_lists
  for each row execute function public.enforce_row_same_org();

drop trigger if exists trg_template_tasks_same_org on public.template_tasks;
create trigger trg_template_tasks_same_org
  before insert or update on public.template_tasks
  for each row execute function public.enforce_row_same_org();

drop trigger if exists trg_projects_same_org on public.projects;
create trigger trg_projects_same_org
  before insert or update on public.projects
  for each row execute function public.enforce_row_same_org();

-- ---------------------------------------------------------------------------
-- complete clear_organization_data
-- ---------------------------------------------------------------------------
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

  delete from public.mention_unreads where organization_id = org;
  delete from public.bulletin_unreads where organization_id = org;
  delete from public.task_comment_reactions where organization_id = org;
  delete from public.task_comment_mentions where organization_id = org;
  delete from public.task_comments where organization_id = org;
  delete from public.tasks where organization_id = org;
  delete from public.task_lists where organization_id = org;
  delete from public.project_assets where organization_id = org;
  delete from public.project_favorites where organization_id = org;
  delete from public.project_members where organization_id = org;
  delete from public.bulletins where organization_id = org;
  delete from public.pod_members where organization_id = org;
  delete from public.pods where organization_id = org;

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

revoke all on function public.clear_organization_data() from public;
grant execute on function public.clear_organization_data() to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private person-avatars, path-scoped writes
-- Path convention: {organization_id}/{person_id}/{filename}
-- ---------------------------------------------------------------------------
update storage.buckets
set public = false
where id = 'person-avatars';

drop policy if exists person_avatars_select on storage.objects;
drop policy if exists person_avatars_insert on storage.objects;
drop policy if exists person_avatars_update on storage.objects;
drop policy if exists person_avatars_delete on storage.objects;

create policy person_avatars_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'person-avatars'
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );

create policy person_avatars_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'person-avatars'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and (
      public.current_role() in ('admin', 'manager')
      or (storage.foldername(name))[2] = public.current_person_id()::text
    )
  );

create policy person_avatars_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'person-avatars'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and (
      public.current_role() in ('admin', 'manager')
      or (storage.foldername(name))[2] = public.current_person_id()::text
    )
  )
  with check (
    bucket_id = 'person-avatars'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and (
      public.current_role() in ('admin', 'manager')
      or (storage.foldername(name))[2] = public.current_person_id()::text
    )
  );

create policy person_avatars_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'person-avatars'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and (
      public.current_role() in ('admin', 'manager')
      or (storage.foldername(name))[2] = public.current_person_id()::text
    )
  );

-- Force RLS on core tenant tables (table owner cannot silently bypass).
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles','clients','projects','milestones','people','assignments','leave_days',
    'holiday_calendars','holiday_calendar_days','project_assets','task_lists','tasks',
    'task_comments','bulletins','project_templates','template_milestones',
    'template_task_lists','template_tasks','project_members','task_comment_mentions',
    'task_comment_reactions','bulletin_unreads','mention_unreads','project_favorites',
    'pods','pod_members'
  ]
  loop
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;
