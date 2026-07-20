-- PM execution layer: tasks, assets, comments, templates, bulletins, project share, client archive

create type public.task_status as enum ('upcoming', 'active', 'complete');
create type public.client_status as enum ('active', 'archived');
create type public.project_asset_kind as enum (
  'sow',
  'website',
  'figma',
  'content',
  'staging',
  'passwords',
  'drive',
  'custom'
);

-- Clients: archive
alter table public.clients
  add column if not exists status public.client_status not null default 'active';

-- Milestones: client approval
alter table public.milestones
  add column if not exists client_approved boolean not null default false;

-- Projects: per-project public share
alter table public.projects
  add column if not exists share_enabled boolean not null default false,
  add column if not exists share_token text;

create unique index if not exists projects_share_token_uidx
  on public.projects (share_token)
  where share_token is not null;

-- Project notebook / assets
create table public.project_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  kind public.project_asset_kind not null default 'custom',
  label text not null default '',
  url text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index project_assets_project_idx on public.project_assets (project_id);

-- Task lists (optionally grouped under a milestone)
create table public.task_lists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  milestone_id uuid references public.milestones(id) on delete set null,
  name text not null default 'Tasks',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index task_lists_project_idx on public.task_lists (project_id);

-- Tasks (one level of subtasks via parent_id)
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  list_id uuid not null references public.task_lists(id) on delete cascade,
  parent_id uuid references public.tasks(id) on delete cascade,
  assignee_person_id uuid references public.people(id) on delete set null,
  title text not null,
  status public.task_status not null default 'upcoming',
  start_date date,
  due_date date,
  notes text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  check (parent_id is distinct from id)
);

create index tasks_list_idx on public.tasks (list_id);
create index tasks_project_idx on public.tasks (project_id);
create index tasks_assignee_idx on public.tasks (assignee_person_id);
create index tasks_due_idx on public.tasks (due_date);

-- Task comments
create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_profile_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '',
  created_at timestamptz not null default now()
);

create index task_comments_task_idx on public.task_comments (task_id);

-- Org / project bulletins for dashboards
create table public.bulletins (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  title text not null,
  body text not null default '',
  pinned boolean not null default false,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index bulletins_org_idx on public.bulletins (organization_id);

-- Project templates
create table public.project_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table public.template_milestones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null references public.project_templates(id) on delete cascade,
  name text not null,
  offset_days int not null default 0,
  sort_order int not null default 0
);

create table public.template_task_lists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null references public.project_templates(id) on delete cascade,
  template_milestone_id uuid references public.template_milestones(id) on delete set null,
  name text not null default 'Tasks',
  sort_order int not null default 0
);

create table public.template_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null references public.project_templates(id) on delete cascade,
  list_id uuid not null references public.template_task_lists(id) on delete cascade,
  parent_id uuid references public.template_tasks(id) on delete cascade,
  title text not null,
  notes text not null default '',
  offset_days int,
  sort_order int not null default 0
);

-- RLS
alter table public.project_assets enable row level security;
alter table public.task_lists enable row level security;
alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.bulletins enable row level security;
alter table public.project_templates enable row level security;
alter table public.template_milestones enable row level security;
alter table public.template_task_lists enable row level security;
alter table public.template_tasks enable row level security;

-- Helper: member's linked person id
create or replace function public.current_person_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.people where profile_id = auth.uid() limit 1
$$;

-- Assets: org read, manage write
create policy project_assets_select on public.project_assets for select
  using (organization_id = public.current_org_id());
create policy project_assets_write on public.project_assets for all
  using (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'))
  with check (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'));

-- Task lists
create policy task_lists_select on public.task_lists for select
  using (organization_id = public.current_org_id());
create policy task_lists_write on public.task_lists for all
  using (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'))
  with check (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'));

-- Tasks: all org members can read; manage write; members can update own assigned status/notes
create policy tasks_select on public.tasks for select
  using (organization_id = public.current_org_id());
create policy tasks_manage_write on public.tasks for all
  using (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'))
  with check (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'));
create policy tasks_member_update on public.tasks for update
  using (
    organization_id = public.current_org_id()
    and public.current_role() = 'member'
    and assignee_person_id = public.current_person_id()
  )
  with check (
    organization_id = public.current_org_id()
    and public.current_role() = 'member'
    and assignee_person_id = public.current_person_id()
  );

-- Comments
create policy task_comments_select on public.task_comments for select
  using (organization_id = public.current_org_id());
create policy task_comments_insert on public.task_comments for insert
  with check (
    organization_id = public.current_org_id()
    and author_profile_id = auth.uid()
  );
create policy task_comments_delete on public.task_comments for delete
  using (
    organization_id = public.current_org_id()
    and (
      author_profile_id = auth.uid()
      or public.current_role() in ('admin', 'manager')
    )
  );

-- Bulletins
create policy bulletins_select on public.bulletins for select
  using (organization_id = public.current_org_id());
create policy bulletins_write on public.bulletins for all
  using (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'))
  with check (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'));

-- Templates (manage only)
create policy project_templates_select on public.project_templates for select
  using (organization_id = public.current_org_id());
create policy project_templates_write on public.project_templates for all
  using (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'))
  with check (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'));

create policy template_milestones_select on public.template_milestones for select
  using (organization_id = public.current_org_id());
create policy template_milestones_write on public.template_milestones for all
  using (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'))
  with check (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'));

create policy template_task_lists_select on public.template_task_lists for select
  using (organization_id = public.current_org_id());
create policy template_task_lists_write on public.template_task_lists for all
  using (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'))
  with check (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'));

create policy template_tasks_select on public.template_tasks for select
  using (organization_id = public.current_org_id());
create policy template_tasks_write on public.template_tasks for all
  using (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'))
  with check (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'));
