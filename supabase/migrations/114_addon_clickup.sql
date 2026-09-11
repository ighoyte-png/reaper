-- ClickUp sync addon (isolated; per-user OAuth; no columns on core tables).

create table if not exists public.addon_clickup_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  enabled boolean not null default false,
  personal_api_token text,
  oauth_client_id text,
  oauth_client_secret text,
  service_profile_id uuid references public.profiles(id) on delete set null,
  clickup_team_id text,
  space_id text,
  space_name text,
  status_map jsonb not null default '{}'::jsonb,
  last_error text,
  last_synced_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.addon_clickup_project_sync (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  enabled boolean not null default false,
  link_mode text check (link_mode is null or link_mode in ('link', 'create')),
  reconciling boolean not null default false,
  last_reconcile_summary jsonb,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (organization_id, project_id)
);

create index if not exists addon_clickup_project_sync_enabled_idx
  on public.addon_clickup_project_sync (organization_id)
  where enabled = true;

create table if not exists public.addon_clickup_links (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null check (
    entity_type in (
      'client',
      'project',
      'task_list',
      'task',
      'comment',
      'milestone'
    )
  ),
  reaper_id text not null,
  clickup_id text not null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, entity_type, reaper_id)
);

create index if not exists addon_clickup_links_clickup_idx
  on public.addon_clickup_links (organization_id, entity_type, clickup_id);

create table if not exists public.addon_clickup_user_map (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  clickup_user_id text not null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, person_id)
);

create table if not exists public.addon_clickup_oauth_tokens (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  clickup_user_id text,
  access_token text not null,
  authorized_team_ids jsonb not null default '[]'::jsonb,
  needs_reauth boolean not null default false,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, profile_id)
);

create index if not exists addon_clickup_oauth_tokens_clickup_user_idx
  on public.addon_clickup_oauth_tokens (organization_id, clickup_user_id)
  where clickup_user_id is not null;

create table if not exists public.addon_clickup_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null,
  reaper_id text not null,
  project_id uuid,
  op text not null check (op in ('upsert', 'delete')),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  attempts int not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists addon_clickup_outbox_due_idx
  on public.addon_clickup_outbox (organization_id, available_at)
  where locked_at is null;

alter table public.addon_clickup_settings enable row level security;
alter table public.addon_clickup_project_sync enable row level security;
alter table public.addon_clickup_links enable row level security;
alter table public.addon_clickup_user_map enable row level security;
alter table public.addon_clickup_oauth_tokens enable row level security;
alter table public.addon_clickup_outbox enable row level security;

-- Settings: members can read enablement (secrets stripped via API).
drop policy if exists addon_clickup_settings_select on public.addon_clickup_settings;
create policy addon_clickup_settings_select on public.addon_clickup_settings for select
  using (organization_id = public.current_org_id());

drop policy if exists addon_clickup_settings_admin_write on public.addon_clickup_settings;
create policy addon_clickup_settings_admin_write on public.addon_clickup_settings for all
  using (
    organization_id = public.current_org_id()
    and public.current_role() = 'admin'
  )
  with check (
    organization_id = public.current_org_id()
    and public.current_role() = 'admin'
  );

drop policy if exists addon_clickup_project_sync_select on public.addon_clickup_project_sync;
create policy addon_clickup_project_sync_select on public.addon_clickup_project_sync for select
  using (organization_id = public.current_org_id());

drop policy if exists addon_clickup_project_sync_write on public.addon_clickup_project_sync;
create policy addon_clickup_project_sync_write on public.addon_clickup_project_sync for all
  using (
    organization_id = public.current_org_id()
    and public.current_role() in ('admin', 'manager')
  )
  with check (
    organization_id = public.current_org_id()
    and public.current_role() in ('admin', 'manager')
  );

drop policy if exists addon_clickup_links_select on public.addon_clickup_links;
create policy addon_clickup_links_select on public.addon_clickup_links for select
  using (organization_id = public.current_org_id());

drop policy if exists addon_clickup_links_write on public.addon_clickup_links;
create policy addon_clickup_links_write on public.addon_clickup_links for all
  using (
    organization_id = public.current_org_id()
    and public.current_role() in ('admin', 'manager')
  )
  with check (
    organization_id = public.current_org_id()
    and public.current_role() in ('admin', 'manager')
  );

drop policy if exists addon_clickup_user_map_select on public.addon_clickup_user_map;
create policy addon_clickup_user_map_select on public.addon_clickup_user_map for select
  using (organization_id = public.current_org_id());

drop policy if exists addon_clickup_user_map_admin_write on public.addon_clickup_user_map;
create policy addon_clickup_user_map_admin_write on public.addon_clickup_user_map for all
  using (
    organization_id = public.current_org_id()
    and public.current_role() = 'admin'
  )
  with check (
    organization_id = public.current_org_id()
    and public.current_role() = 'admin'
  );

drop policy if exists addon_clickup_oauth_tokens_select_own on public.addon_clickup_oauth_tokens;
create policy addon_clickup_oauth_tokens_select_own on public.addon_clickup_oauth_tokens for select
  using (
    organization_id = public.current_org_id()
    and profile_id = auth.uid()
  );

drop policy if exists addon_clickup_oauth_tokens_admin_select on public.addon_clickup_oauth_tokens;
create policy addon_clickup_oauth_tokens_admin_select on public.addon_clickup_oauth_tokens for select
  using (
    organization_id = public.current_org_id()
    and public.current_role() = 'admin'
  );

-- Outbox is service-role / API processed; allow org managers to select for debugging.
drop policy if exists addon_clickup_outbox_select on public.addon_clickup_outbox;
create policy addon_clickup_outbox_select on public.addon_clickup_outbox for select
  using (
    organization_id = public.current_org_id()
    and public.current_role() in ('admin', 'manager')
  );

-- Enqueue helper: only if org addon enabled and (if project-scoped) project sync on.
create or replace function public.addon_clickup_enqueue(
  p_org uuid,
  p_entity_type text,
  p_reaper_id text,
  p_project_id uuid,
  p_op text,
  p_actor_profile_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  settings_on boolean;
  project_on boolean;
begin
  select coalesce(enabled, false) into settings_on
  from public.addon_clickup_settings
  where organization_id = p_org;

  if not coalesce(settings_on, false) then
    return;
  end if;

  if p_project_id is not null then
    select coalesce(enabled, false) and not coalesce(reconciling, false)
      into project_on
    from public.addon_clickup_project_sync
    where organization_id = p_org and project_id = p_project_id;

    if not coalesce(project_on, false) then
      return;
    end if;
  end if;

  insert into public.addon_clickup_outbox (
    organization_id, entity_type, reaper_id, project_id, op, actor_profile_id
  ) values (
    p_org, p_entity_type, p_reaper_id, p_project_id, p_op, p_actor_profile_id
  );
end;
$$;

create or replace function public.addon_clickup_projects_trig()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.addon_clickup_enqueue(
      old.organization_id, 'project', old.id::text, old.id, 'delete', auth.uid()
    );
    return old;
  end if;
  if coalesce(new.sandbox_mode, false) then
    return new;
  end if;
  perform public.addon_clickup_enqueue(
    new.organization_id, 'project', new.id::text, new.id, 'upsert', auth.uid()
  );
  return new;
end;
$$;

drop trigger if exists addon_clickup_projects_aiud on public.projects;
create trigger addon_clickup_projects_aiud
  after insert or update or delete on public.projects
  for each row execute function public.addon_clickup_projects_trig();

create or replace function public.addon_clickup_clients_trig()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.addon_clickup_enqueue(
      old.organization_id, 'client', old.id::text, null, 'delete', auth.uid()
    );
    return old;
  end if;
  perform public.addon_clickup_enqueue(
    new.organization_id, 'client', new.id::text, null, 'upsert', auth.uid()
  );
  return new;
end;
$$;

drop trigger if exists addon_clickup_clients_aiud on public.clients;
create trigger addon_clickup_clients_aiud
  after insert or update or delete on public.clients
  for each row execute function public.addon_clickup_clients_trig();

create or replace function public.addon_clickup_task_lists_trig()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.addon_clickup_enqueue(
      old.organization_id, 'task_list', old.id::text, old.project_id, 'delete', auth.uid()
    );
    return old;
  end if;
  perform public.addon_clickup_enqueue(
    new.organization_id, 'task_list', new.id::text, new.project_id, 'upsert', auth.uid()
  );
  return new;
end;
$$;

drop trigger if exists addon_clickup_task_lists_aiud on public.task_lists;
create trigger addon_clickup_task_lists_aiud
  after insert or update or delete on public.task_lists
  for each row execute function public.addon_clickup_task_lists_trig();

create or replace function public.addon_clickup_tasks_trig()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
begin
  if tg_op = 'DELETE' then
    perform public.addon_clickup_enqueue(
      old.organization_id, 'task', old.id::text, old.project_id, 'delete', auth.uid()
    );
    return old;
  end if;
  if coalesce(new.is_divider, false) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    actor := coalesce(new.created_by_profile_id, auth.uid());
  else
    actor := coalesce(
      new.edited_by_profile_id,
      new.status_changed_by_profile_id,
      new.created_by_profile_id,
      auth.uid()
    );
  end if;
  perform public.addon_clickup_enqueue(
    new.organization_id, 'task', new.id::text, new.project_id, 'upsert', actor
  );
  return new;
end;
$$;

drop trigger if exists addon_clickup_tasks_aiud on public.tasks;
create trigger addon_clickup_tasks_aiud
  after insert or update or delete on public.tasks
  for each row execute function public.addon_clickup_tasks_trig();

create or replace function public.addon_clickup_comments_trig()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid;
  actor uuid;
begin
  if tg_op = 'DELETE' then
    select project_id into pid from public.tasks where id = old.task_id;
    perform public.addon_clickup_enqueue(
      old.organization_id, 'comment', old.id::text, pid, 'delete',
      coalesce(old.author_profile_id, auth.uid())
    );
    return old;
  end if;
  select project_id into pid from public.tasks where id = new.task_id;
  actor := coalesce(new.author_profile_id, auth.uid());
  perform public.addon_clickup_enqueue(
    new.organization_id, 'comment', new.id::text, pid, 'upsert', actor
  );
  return new;
end;
$$;

drop trigger if exists addon_clickup_comments_aiud on public.task_comments;
create trigger addon_clickup_comments_aiud
  after insert or update or delete on public.task_comments
  for each row execute function public.addon_clickup_comments_trig();

create or replace function public.addon_clickup_milestones_trig()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.addon_clickup_enqueue(
      old.organization_id, 'milestone', old.id::text, old.project_id, 'delete', auth.uid()
    );
    return old;
  end if;
  perform public.addon_clickup_enqueue(
    new.organization_id, 'milestone', new.id::text, new.project_id, 'upsert', auth.uid()
  );
  return new;
end;
$$;

drop trigger if exists addon_clickup_milestones_aiud on public.milestones;
create trigger addon_clickup_milestones_aiud
  after insert or update or delete on public.milestones
  for each row execute function public.addon_clickup_milestones_trig();
