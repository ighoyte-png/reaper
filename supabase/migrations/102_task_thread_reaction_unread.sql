-- When someone reacts to a comment, light the comment author's task-thread
-- unread (same badge path as a new comment on that task).

create or replace function public.notify_task_thread_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_profile uuid;
  v_author_person uuid;
  v_task_id uuid;
  v_org uuid;
begin
  select c.author_profile_id, c.task_id, c.organization_id
    into v_author_profile, v_task_id, v_org
  from public.task_comments c
  where c.id = new.comment_id;

  if v_author_profile is null or v_task_id is null then
    return new;
  end if;

  -- Don't notify the reactor for their own comment.
  if v_author_profile = new.profile_id then
    return new;
  end if;

  select p.id into v_author_person
  from public.people p
  where p.organization_id = v_org
    and p.profile_id = v_author_profile
  limit 1;

  if v_author_person is null then
    return new;
  end if;

  insert into public.task_thread_unreads (task_id, person_id, organization_id)
  values (v_task_id, v_author_person, v_org)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists task_comment_reactions_notify_thread on public.task_comment_reactions;
create trigger task_comment_reactions_notify_thread
  after insert on public.task_comment_reactions
  for each row
  execute function public.notify_task_thread_reaction();

-- Allow org members to insert thread unreads when notifying another person
-- (client optimistic path); delete/select policies already exist.
drop policy if exists task_thread_unreads_insert on public.task_thread_unreads;
create policy task_thread_unreads_insert on public.task_thread_unreads for insert
  with check (
    organization_id = public.current_org_id()
    and (
      person_id = public.current_person_id()
      or public.current_role() in ('admin', 'manager')
      or exists (
        select 1
        from public.task_comments c
        join public.people p
          on p.organization_id = c.organization_id
         and p.profile_id = c.author_profile_id
        where c.task_id = task_thread_unreads.task_id
          and c.organization_id = task_thread_unreads.organization_id
          and p.id = task_thread_unreads.person_id
      )
    )
  );
