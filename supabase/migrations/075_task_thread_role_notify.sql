-- Notify task creator and/or assignee on every comment by someone else
-- (covers self-assigned tasks and third-party comments).

create or replace function public.notify_task_thread_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignee uuid;
  v_assigner uuid;
  v_author_person uuid;
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

  select t.assignee_person_id into v_assignee
  from public.tasks t
  where t.id = new.task_id;

  select p.id into v_assigner
  from public.tasks t
  join public.people p
    on p.organization_id = t.organization_id
   and p.profile_id = t.created_by_profile_id
  where t.id = new.task_id
  limit 1;

  if v_assigner is null then
    select pr.manager_person_id into v_assigner
    from public.tasks t
    join public.projects pr on pr.id = t.project_id
    where t.id = new.task_id;
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

  insert into public.task_thread_unreads (task_id, person_id, organization_id)
  select new.task_id, s.person_id, new.organization_id
  from public.task_thread_subscribers s
  where s.task_id = new.task_id
    and s.person_id <> v_author_person
  on conflict do nothing;

  return new;
end;
$$;
