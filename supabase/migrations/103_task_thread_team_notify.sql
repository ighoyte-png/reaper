-- Notify project manager + project team roster on task comments (in addition to
-- assigner, assignee, and thread subscribers). Keeps PM/team in the loop even
-- when they are not the assigner/assignee.

create or replace function public.notify_task_thread_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignee uuid;
  v_assigner uuid;
  v_pm uuid;
  v_author_person uuid;
  v_project_id uuid;
begin
  select p.id into v_author_person
  from public.people p
  where p.organization_id = new.organization_id
    and p.profile_id = new.author_profile_id
  limit 1;

  if v_author_person is null then
    return new;
  end if;

  insert into public.task_thread_subscribers (task_id, person_id, organization_id)
  values (new.task_id, v_author_person, new.organization_id)
  on conflict do nothing;

  select t.assignee_person_id, t.project_id
    into v_assignee, v_project_id
  from public.tasks t
  where t.id = new.task_id;

  select p.id into v_assigner
  from public.tasks t
  join public.people p
    on p.organization_id = t.organization_id
   and p.profile_id = t.created_by_profile_id
  where t.id = new.task_id
  limit 1;

  select pr.manager_person_id into v_pm
  from public.projects pr
  where pr.id = v_project_id;

  if v_assigner is null then
    v_assigner := v_pm;
  end if;

  if v_assignee is not null and v_assignee <> v_author_person then
    insert into public.task_thread_unreads (task_id, person_id, organization_id)
    values (new.task_id, v_assignee, new.organization_id)
    on conflict do nothing;
  end if;

  if v_assigner is not null and v_assigner <> v_author_person then
    insert into public.task_thread_unreads (task_id, person_id, organization_id)
    values (new.task_id, v_assigner, new.organization_id)
    on conflict do nothing;
  end if;

  -- Project manager (even when someone else is the assigner).
  if v_pm is not null and v_pm <> v_author_person then
    insert into public.task_thread_unreads (task_id, person_id, organization_id)
    values (new.task_id, v_pm, new.organization_id)
    on conflict do nothing;
  end if;

  -- Explicit project team roster.
  if v_project_id is not null then
    insert into public.task_thread_unreads (task_id, person_id, organization_id)
    select new.task_id, pm.person_id, new.organization_id
    from public.project_members pm
    where pm.project_id = v_project_id
      and pm.organization_id = new.organization_id
      and pm.person_id <> v_author_person
    on conflict do nothing;
  end if;

  insert into public.task_thread_unreads (task_id, person_id, organization_id)
  select new.task_id, s.person_id, new.organization_id
  from public.task_thread_subscribers s
  where s.task_id = new.task_id
    and s.person_id <> v_author_person
  on conflict do nothing;

  return new;
end;
$$;
