-- Per-profile starred projects (nav tabs + sidebar), ordered by sort_order.

create table if not exists public.project_favorites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (profile_id, project_id)
);

create index if not exists project_favorites_profile_sort_idx
  on public.project_favorites (profile_id, sort_order);

create index if not exists project_favorites_org_idx
  on public.project_favorites (organization_id);

alter table public.project_favorites enable row level security;

drop policy if exists project_favorites_select on public.project_favorites;
create policy project_favorites_select on public.project_favorites for select
  using (
    organization_id = public.current_org_id()
    and profile_id = auth.uid()
  );

drop policy if exists project_favorites_insert on public.project_favorites;
create policy project_favorites_insert on public.project_favorites for insert
  with check (
    organization_id = public.current_org_id()
    and profile_id = auth.uid()
    and exists (
      select 1 from public.projects p
      where p.id = project_id
        and p.organization_id = organization_id
    )
  );

drop policy if exists project_favorites_update on public.project_favorites;
create policy project_favorites_update on public.project_favorites for update
  using (
    organization_id = public.current_org_id()
    and profile_id = auth.uid()
  )
  with check (
    organization_id = public.current_org_id()
    and profile_id = auth.uid()
  );

drop policy if exists project_favorites_delete on public.project_favorites;
create policy project_favorites_delete on public.project_favorites for delete
  using (
    organization_id = public.current_org_id()
    and profile_id = auth.uid()
  );
