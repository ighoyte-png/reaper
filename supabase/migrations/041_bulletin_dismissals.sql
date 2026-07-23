-- Per-profile bulletin dismissals so "new" state persists across browsers/devices.

create table if not exists public.bulletin_dismissals (
  bulletin_id uuid not null references public.bulletins(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (bulletin_id, profile_id)
);

create index if not exists bulletin_dismissals_profile_idx
  on public.bulletin_dismissals (profile_id);

create index if not exists bulletin_dismissals_org_idx
  on public.bulletin_dismissals (organization_id);

alter table public.bulletin_dismissals enable row level security;

-- Users only see and manage their own dismissals.
create policy bulletin_dismissals_select on public.bulletin_dismissals for select
  using (
    organization_id = public.current_org_id()
    and profile_id = auth.uid()
  );

create policy bulletin_dismissals_insert on public.bulletin_dismissals for insert
  with check (
    organization_id = public.current_org_id()
    and profile_id = auth.uid()
    and exists (
      select 1 from public.bulletins b
      where b.id = bulletin_id
        and b.organization_id = organization_id
    )
  );

create policy bulletin_dismissals_delete on public.bulletin_dismissals for delete
  using (
    organization_id = public.current_org_id()
    and profile_id = auth.uid()
  );

alter table public.bulletin_dismissals replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.bulletin_dismissals;
exception
  when duplicate_object then null;
end $$;
