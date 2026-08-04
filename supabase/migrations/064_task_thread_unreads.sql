-- Per-task assigner ↔ assignee comment thread unreads (subtractive dismiss on open).

create table if not exists public.task_thread_unreads (
  task_id uuid not null references public.tasks(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, person_id)
);

create index if not exists task_thread_unreads_person_idx
  on public.task_thread_unreads (person_id);

create index if not exists task_thread_unreads_org_idx
  on public.task_thread_unreads (organization_id);

alter table public.task_thread_unreads enable row level security;

drop policy if exists task_thread_unreads_select on public.task_thread_unreads;
create policy task_thread_unreads_select on public.task_thread_unreads for select
  using (
    organization_id = public.current_org_id()
    and (
      person_id = public.current_person_id()
      or public.current_role() in ('admin', 'manager')
    )
  );

drop policy if exists task_thread_unreads_delete on public.task_thread_unreads;
create policy task_thread_unreads_delete on public.task_thread_unreads for delete
  using (
    organization_id = public.current_org_id()
    and (
      person_id = public.current_person_id()
      or public.current_role() in ('admin', 'manager')
    )
  );

alter table public.task_thread_unreads replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.task_thread_unreads;
exception
  when duplicate_object then null;
end $$;

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

  select p.id into v_author_person
  from public.people p
  where p.organization_id = new.organization_id
    and p.profile_id = new.author_profile_id
  limit 1;

  if v_author_person is null or v_assignee is null or v_assigner is null then
    return new;
  end if;

  if v_author_person = v_assigner and v_author_person <> v_assignee then
    v_notify := v_assignee;
  elsif v_author_person = v_assignee and v_author_person <> v_assigner then
    v_notify := v_assigner;
  else
    return new;
  end if;

  insert into public.task_thread_unreads (task_id, person_id, organization_id)
  values (new.task_id, v_notify, new.organization_id)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists trg_notify_task_thread_comment on public.task_comments;
create trigger trg_notify_task_thread_comment
  after insert on public.task_comments
  for each row
  execute function public.notify_task_thread_comment();
