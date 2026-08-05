-- Persist who follows a task comment thread (comment authors + @mentioned).
-- New comments notify: assigner↔assignee counterpart (as before) ∪ other subscribers.

create table if not exists public.task_thread_subscribers (
  task_id uuid not null references public.tasks(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, person_id)
);

create index if not exists task_thread_subscribers_person_idx
  on public.task_thread_subscribers (person_id);

create index if not exists task_thread_subscribers_org_idx
  on public.task_thread_subscribers (organization_id);

alter table public.task_thread_subscribers enable row level security;

drop policy if exists task_thread_subscribers_select on public.task_thread_subscribers;
create policy task_thread_subscribers_select on public.task_thread_subscribers for select
  using (
    organization_id = public.current_org_id()
    and (
      person_id = public.current_person_id()
      or public.current_role() in ('admin', 'manager')
    )
  );

-- Backfill from existing comment authors + mentions.
insert into public.task_thread_subscribers (task_id, person_id, organization_id)
select distinct c.task_id, p.id, c.organization_id
from public.task_comments c
join public.people p
  on p.organization_id = c.organization_id
 and p.profile_id = c.author_profile_id
on conflict do nothing;

insert into public.task_thread_subscribers (task_id, person_id, organization_id)
select distinct c.task_id, m.person_id, m.organization_id
from public.task_comment_mentions m
join public.task_comments c on c.id = m.comment_id
on conflict do nothing;

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
  v_notify uuid;
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

  v_notify := null;
  if v_assignee is not null and v_assigner is not null then
    if v_author_person = v_assigner and v_author_person <> v_assignee then
      v_notify := v_assignee;
    elsif v_author_person = v_assignee and v_author_person <> v_assigner then
      v_notify := v_assigner;
    end if;
  end if;

  if v_notify is not null then
    insert into public.task_thread_unreads (task_id, person_id, organization_id)
    values (new.task_id, v_notify, new.organization_id)
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

  insert into public.task_thread_subscribers (task_id, person_id, organization_id)
  values (v_task_id, new.person_id, new.organization_id)
  on conflict do nothing;

  insert into public.task_thread_unreads (task_id, person_id, organization_id)
  values (v_task_id, new.person_id, new.organization_id)
  on conflict do nothing;

  return new;
end;
$$;
