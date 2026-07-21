-- Hide assets from client portal
alter table public.project_assets
  add column if not exists hide_from_client boolean not null default false;

-- Optional milestone start date (progress window start)
alter table public.milestones
  add column if not exists start_date date;

-- Task comment @mentions (notify tagged project members)
create table if not exists public.task_comment_mentions (
  comment_id uuid not null references public.task_comments(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  primary key (comment_id, person_id)
);

create index if not exists task_comment_mentions_person_idx
  on public.task_comment_mentions (person_id);

create index if not exists task_comment_mentions_org_idx
  on public.task_comment_mentions (organization_id);

alter table public.task_comment_mentions enable row level security;

create policy task_comment_mentions_select on public.task_comment_mentions for select
  using (organization_id = public.current_org_id());

create policy task_comment_mentions_insert on public.task_comment_mentions for insert
  with check (
    organization_id = public.current_org_id()
    and exists (
      select 1 from public.task_comments c
      where c.id = comment_id
        and c.organization_id = organization_id
        and c.author_profile_id = auth.uid()
    )
  );

create policy task_comment_mentions_delete on public.task_comment_mentions for delete
  using (
    organization_id = public.current_org_id()
    and (
      exists (
        select 1 from public.task_comments c
        where c.id = comment_id and c.author_profile_id = auth.uid()
      )
      or public.current_role() in ('admin', 'manager')
    )
  );
