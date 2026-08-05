-- Attachments metadata for Cloudflare R2 (+ avatar link + storage size limits).

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  uploaded_by_profile_id uuid references public.profiles(id) on delete set null,
  entity_type text not null
    check (entity_type in ('profile_picture', 'comment', 'task_note')),
  entity_id uuid not null,
  storage_provider text not null default 'r2'
    check (storage_provider in ('r2')),
  bucket text not null,
  storage_key text not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  ready boolean not null default false,
  created_at timestamptz not null default now(),
  unique (storage_key)
);

create index if not exists attachments_org_entity_idx
  on public.attachments (organization_id, entity_type, entity_id);

create index if not exists attachments_uploaded_by_idx
  on public.attachments (uploaded_by_profile_id);

alter table public.people
  add column if not exists avatar_attachment_id uuid
    references public.attachments(id) on delete set null;

alter table public.app_settings
  add column if not exists max_image_bytes bigint not null default 10485760;

alter table public.app_settings
  add column if not exists max_document_bytes bigint not null default 26214400;

alter table public.attachments enable row level security;

-- Org members can read attachments in their org.
drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments
  for select
  to authenticated
  using (organization_id = public.current_org_id());

-- Inserts/updates/deletes go through service role API routes (presign flow).
-- Authenticated users still need select for joining avatar_attachment_id.

drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments
  for insert
  to authenticated
  with check (
    organization_id = public.current_org_id()
    and uploaded_by_profile_id = auth.uid()
  );

drop policy if exists attachments_update on public.attachments;
create policy attachments_update on public.attachments
  for update
  to authenticated
  using (
    organization_id = public.current_org_id()
    and (
      uploaded_by_profile_id = auth.uid()
      or public.current_role() in ('admin', 'manager')
    )
  )
  with check (organization_id = public.current_org_id());

drop policy if exists attachments_delete on public.attachments;
create policy attachments_delete on public.attachments
  for delete
  to authenticated
  using (
    organization_id = public.current_org_id()
    and (
      uploaded_by_profile_id = auth.uid()
      or public.current_role() in ('admin', 'manager')
    )
  );
