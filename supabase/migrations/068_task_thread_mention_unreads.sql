-- @mentions also light the orange task-thread comment badge (beyond assigner ↔ assignee).

create or replace function public.notify_task_thread_mention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task_id uuid;
  v_author_profile uuid;
  v_author_person uuid;
begin
  select c.task_id, c.author_profile_id
    into v_task_id, v_author_profile
  from public.task_comments c
  where c.id = new.comment_id;

  if v_task_id is null then
    return new;
  end if;

  if v_author_profile is not null then
    select p.id into v_author_person
    from public.people p
    where p.organization_id = new.organization_id
      and p.profile_id = v_author_profile
    limit 1;
  end if;

  -- Authors notifying themselves via @mention is a no-op.
  if v_author_person is not null and new.person_id = v_author_person then
    return new;
  end if;

  insert into public.task_thread_unreads (task_id, person_id, organization_id)
  values (v_task_id, new.person_id, new.organization_id)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists trg_notify_task_thread_mention on public.task_comment_mentions;
create trigger trg_notify_task_thread_mention
  after insert on public.task_comment_mentions
  for each row
  execute function public.notify_task_thread_mention();
