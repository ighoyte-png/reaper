-- Durable notification feed + Web Push subscriptions.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null
    check (kind in (
      'mention',
      'message',
      'assigned',
      'bulletin',
      'in_review',
      'milestone_approved',
      'reaction'
    )),
  title text not null,
  body text not null default '',
  href text not null default '/',
  entity_type text null,
  entity_id text null,
  actor_person_id uuid null references public.people(id) on delete set null,
  read_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_profile_id, created_at desc);

create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_profile_id)
  where read_at is null;

create index if not exists notifications_org_idx
  on public.notifications (organization_id);

create index if not exists notifications_entity_idx
  on public.notifications (entity_type, entity_id)
  where entity_id is not null;

alter table public.notifications enable row level security;

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select
  using (
    organization_id = public.current_org_id()
    and recipient_profile_id = auth.uid()
  );

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update
  using (
    organization_id = public.current_org_id()
    and recipient_profile_id = auth.uid()
  )
  with check (
    organization_id = public.current_org_id()
    and recipient_profile_id = auth.uid()
  );

drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications for delete
  using (
    organization_id = public.current_org_id()
    and recipient_profile_id = auth.uid()
  );

-- Inserts only via security definer / service role (no direct client insert policy).

alter table public.notifications replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
end $$;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (endpoint)
);

create index if not exists push_subscriptions_profile_idx
  on public.push_subscriptions (profile_id);

create index if not exists push_subscriptions_org_idx
  on public.push_subscriptions (organization_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions for select
  using (
    organization_id = public.current_org_id()
    and profile_id = auth.uid()
  );

drop policy if exists push_subscriptions_insert on public.push_subscriptions;
create policy push_subscriptions_insert on public.push_subscriptions for insert
  with check (
    organization_id = public.current_org_id()
    and profile_id = auth.uid()
  );

drop policy if exists push_subscriptions_update on public.push_subscriptions;
create policy push_subscriptions_update on public.push_subscriptions for update
  using (
    organization_id = public.current_org_id()
    and profile_id = auth.uid()
  )
  with check (
    organization_id = public.current_org_id()
    and profile_id = auth.uid()
  );

drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_delete on public.push_subscriptions for delete
  using (
    organization_id = public.current_org_id()
    and profile_id = auth.uid()
  );

-- Emit one or more feed rows (triggers + RPC). Returns inserted ids.
create or replace function public.emit_notifications(
  p_organization_id uuid,
  p_recipient_profile_ids uuid[],
  p_kind text,
  p_title text,
  p_body text default '',
  p_href text default '/',
  p_entity_type text default null,
  p_entity_id text default null,
  p_actor_person_id uuid default null
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  rid uuid;
  inserted uuid[] := '{}';
  recip uuid;
begin
  if p_organization_id is null then
    return inserted;
  end if;
  if p_recipient_profile_ids is null or cardinality(p_recipient_profile_ids) = 0 then
    return inserted;
  end if;

  foreach recip in array p_recipient_profile_ids
  loop
    if recip is null then
      continue;
    end if;
    -- Light dedupe: same recipient/kind/entity within 2 minutes.
    if p_entity_id is not null and exists (
      select 1
      from public.notifications n
      where n.recipient_profile_id = recip
        and n.kind = p_kind
        and n.entity_id = p_entity_id
        and n.created_at > now() - interval '2 minutes'
    ) then
      continue;
    end if;

    insert into public.notifications (
      organization_id,
      recipient_profile_id,
      kind,
      title,
      body,
      href,
      entity_type,
      entity_id,
      actor_person_id
    )
    values (
      p_organization_id,
      recip,
      p_kind,
      coalesce(nullif(trim(p_title), ''), 'Notification'),
      coalesce(p_body, ''),
      coalesce(nullif(trim(p_href), ''), '/'),
      p_entity_type,
      p_entity_id,
      p_actor_person_id
    )
    returning id into rid;

    inserted := array_append(inserted, rid);
  end loop;

  return inserted;
end;
$$;

revoke all on function public.emit_notifications(
  uuid, uuid[], text, text, text, text, text, text, uuid
) from public;
grant execute on function public.emit_notifications(
  uuid, uuid[], text, text, text, text, text, text, uuid
) to authenticated, service_role;

-- Mark all unread feed rows read for the current user.
create or replace function public.mark_all_notifications_read()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications
  set read_at = now()
  where recipient_profile_id = auth.uid()
    and read_at is null
    and organization_id = public.current_org_id();
end;
$$;

revoke all on function public.mark_all_notifications_read() from public;
grant execute on function public.mark_all_notifications_read() to authenticated;
