-- Workspace custom emojis (Slack-style :name:) stored as R2 attachments.

-- Allow custom_emoji on attachments.entity_type
do $$
declare
  con_name text;
begin
  select c.conname into con_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'attachments'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%entity_type%'
  limit 1;
  if con_name is not null then
    execute format('alter table public.attachments drop constraint %I', con_name);
  end if;
end $$;

alter table public.attachments
  add constraint attachments_entity_type_check
  check (entity_type in ('profile_picture', 'comment', 'task_note', 'custom_emoji'));

create table if not exists public.organization_emojis (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  attachment_id uuid not null references public.attachments(id) on delete cascade,
  created_by_profile_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, name),
  constraint organization_emojis_name_format
    check (name ~ '^[a-z0-9_]+$' and char_length(name) between 2 and 32)
);

create index if not exists organization_emojis_org_idx
  on public.organization_emojis (organization_id);

create index if not exists organization_emojis_attachment_idx
  on public.organization_emojis (attachment_id);

alter table public.organization_emojis enable row level security;

drop policy if exists organization_emojis_select on public.organization_emojis;
create policy organization_emojis_select on public.organization_emojis
  for select
  to authenticated
  using (organization_id = public.current_org_id());

drop policy if exists organization_emojis_insert on public.organization_emojis;
create policy organization_emojis_insert on public.organization_emojis
  for insert
  to authenticated
  with check (
    organization_id = public.current_org_id()
    and public.current_role() = 'admin'
  );

drop policy if exists organization_emojis_update on public.organization_emojis;
create policy organization_emojis_update on public.organization_emojis
  for update
  to authenticated
  using (
    organization_id = public.current_org_id()
    and public.current_role() = 'admin'
  )
  with check (
    organization_id = public.current_org_id()
    and public.current_role() = 'admin'
  );

drop policy if exists organization_emojis_delete on public.organization_emojis;
create policy organization_emojis_delete on public.organization_emojis
  for delete
  to authenticated
  using (
    organization_id = public.current_org_id()
    and public.current_role() = 'admin'
  );

alter table public.organization_emojis replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.organization_emojis;
exception
  when duplicate_object then null;
end $$;
