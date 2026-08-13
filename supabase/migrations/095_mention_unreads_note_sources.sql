-- Mention inbox: support task-description and assignment-note @mentions
-- (in addition to comment mentions). Exactly one source id per row.

alter table public.mention_unreads
  add column if not exists task_id uuid references public.tasks(id) on delete cascade;

alter table public.mention_unreads
  add column if not exists assignment_id uuid references public.assignments(id) on delete cascade;

-- Drop the (comment_id, person_id) PK before making comment_id nullable.
alter table public.mention_unreads
  drop constraint if exists mention_unreads_pkey;

alter table public.mention_unreads
  alter column comment_id drop not null;

alter table public.mention_unreads
  add column if not exists id uuid not null default gen_random_uuid();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'mention_unreads_pkey'
      and conrelid = 'public.mention_unreads'::regclass
  ) then
    alter table public.mention_unreads
      add constraint mention_unreads_pkey primary key (id);
  end if;
end $$;

alter table public.mention_unreads
  drop constraint if exists mention_unreads_source_chk;

alter table public.mention_unreads
  add constraint mention_unreads_source_chk check (
    (
      (comment_id is not null)::int
      + (task_id is not null)::int
      + (assignment_id is not null)::int
    ) = 1
  );

create unique index if not exists mention_unreads_comment_person_uidx
  on public.mention_unreads (comment_id, person_id)
  where comment_id is not null;

create unique index if not exists mention_unreads_task_person_uidx
  on public.mention_unreads (task_id, person_id)
  where task_id is not null;

create unique index if not exists mention_unreads_assignment_person_uidx
  on public.mention_unreads (assignment_id, person_id)
  where assignment_id is not null;

create index if not exists mention_unreads_task_idx
  on public.mention_unreads (task_id)
  where task_id is not null;

create index if not exists mention_unreads_assignment_idx
  on public.mention_unreads (assignment_id)
  where assignment_id is not null;

drop policy if exists mention_unreads_insert on public.mention_unreads;
create policy mention_unreads_insert on public.mention_unreads for insert
  with check (
    organization_id = public.current_org_id()
    and (
      public.current_role() in ('admin', 'manager')
      or (
        comment_id is not null
        and exists (
          select 1
          from public.task_comments c
          where c.id = comment_id
            and c.organization_id = organization_id
            and c.author_profile_id = auth.uid()
        )
      )
      or (
        task_id is not null
        and exists (
          select 1
          from public.tasks t
          where t.id = task_id
            and t.organization_id = organization_id
            and public.is_project_manager(t.project_id)
        )
      )
      or (
        assignment_id is not null
        and exists (
          select 1
          from public.assignments a
          where a.id = assignment_id
            and a.organization_id = organization_id
            and public.is_project_manager(a.project_id)
        )
      )
    )
  );
