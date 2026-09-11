-- ClickUp addon: two-way sync (webhooks, echo suppress, inbound events).

alter table public.addon_clickup_settings
  add column if not exists webhook_enabled boolean not null default false,
  add column if not exists webhook_id text,
  add column if not exists webhook_secret text,
  add column if not exists last_webhook_at timestamptz,
  add column if not exists last_webhook_error text;

alter table public.addon_clickup_links
  add column if not exists last_pushed_at timestamptz,
  add column if not exists last_inbound_at timestamptz,
  add column if not exists content_hash text;

create table if not exists public.addon_clickup_inbound_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  webhook_id text,
  idempotency_key text not null,
  event_name text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'processed', 'ignored', 'error')),
  last_error text,
  attempts int not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (organization_id, idempotency_key)
);

create index if not exists addon_clickup_inbound_due_idx
  on public.addon_clickup_inbound_events (organization_id, available_at)
  where locked_at is null and status = 'pending';

-- Short-lived suppress so inbound Reaper writes do not bounce to ClickUp.
create table if not exists public.addon_clickup_suppress (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null,
  reaper_id text not null,
  until timestamptz not null,
  primary key (organization_id, entity_type, reaper_id)
);

create index if not exists addon_clickup_suppress_until_idx
  on public.addon_clickup_suppress (until);

alter table public.addon_clickup_inbound_events enable row level security;
alter table public.addon_clickup_suppress enable row level security;

drop policy if exists addon_clickup_inbound_events_select on public.addon_clickup_inbound_events;
create policy addon_clickup_inbound_events_select on public.addon_clickup_inbound_events for select
  using (
    organization_id = public.current_org_id()
    and public.current_role() in ('admin', 'manager')
  );

-- Enqueue: skip when outbound suppress is active (inbound apply in progress).
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
  suppressed boolean;
begin
  select coalesce(enabled, false) into settings_on
  from public.addon_clickup_settings
  where organization_id = p_org;

  if not coalesce(settings_on, false) then
    return;
  end if;

  select exists (
    select 1 from public.addon_clickup_suppress s
    where s.organization_id = p_org
      and s.entity_type = p_entity_type
      and s.reaper_id = p_reaper_id
      and s.until > now()
  ) into suppressed;

  if suppressed then
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

create or replace function public.addon_clickup_suppress_outbound(
  p_org uuid,
  p_entity_type text,
  p_reaper_id text,
  p_seconds int default 45
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.addon_clickup_suppress (
    organization_id, entity_type, reaper_id, until
  ) values (
    p_org, p_entity_type, p_reaper_id, now() + make_interval(secs => greatest(p_seconds, 5))
  )
  on conflict (organization_id, entity_type, reaper_id)
  do update set until = excluded.until;
end;
$$;

grant execute on function public.addon_clickup_suppress_outbound(uuid, text, text, int)
  to authenticated, service_role;

