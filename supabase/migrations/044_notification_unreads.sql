-- Invert notification persistence: store unread ids, delete on dismiss
-- (bounded by currently-unread items, not lifetime dismissals).

-- ---------------------------------------------------------------------------
-- Bulletin unreads (per profile)
-- ---------------------------------------------------------------------------
create table if not exists public.bulletin_unreads (
  bulletin_id uuid not null references public.bulletins(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (bulletin_id, profile_id)
);

create index if not exists bulletin_unreads_profile_idx
  on public.bulletin_unreads (profile_id);

create index if not exists bulletin_unreads_org_idx
  on public.bulletin_unreads (organization_id);

alter table public.bulletin_unreads enable row level security;

drop policy if exists bulletin_unreads_select on public.bulletin_unreads;
create policy bulletin_unreads_select on public.bulletin_unreads for select
  using (
    organization_id = public.current_org_id()
    and (
      profile_id = auth.uid()
      or public.current_role() in ('admin', 'manager')
    )
  );

drop policy if exists bulletin_unreads_insert on public.bulletin_unreads;
create policy bulletin_unreads_insert on public.bulletin_unreads for insert
  with check (
    organization_id = public.current_org_id()
    and (
      profile_id = auth.uid()
      or public.current_role() in ('admin', 'manager')
    )
    and exists (
      select 1 from public.bulletins b
      where b.id = bulletin_id
        and b.organization_id = organization_id
    )
  );

drop policy if exists bulletin_unreads_delete on public.bulletin_unreads;
create policy bulletin_unreads_delete on public.bulletin_unreads for delete
  using (
    organization_id = public.current_org_id()
    and (
      profile_id = auth.uid()
      or public.current_role() in ('admin', 'manager')
    )
  );

alter table public.bulletin_unreads replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.bulletin_unreads;
exception
  when duplicate_object then null;
end $$;

-- Invert existing dismissals → unreads when the old table is present.
do $$
begin
  if to_regclass('public.bulletin_dismissals') is null then
    return;
  end if;

  insert into public.bulletin_unreads (bulletin_id, profile_id, organization_id)
  select b.id, p.id, b.organization_id
  from public.bulletins b
  join public.profiles p on p.organization_id = b.organization_id
  where (b.created_by_profile_id is distinct from p.id)
    and not exists (
      select 1
      from public.bulletin_dismissals d
      where d.bulletin_id = b.id
        and d.profile_id = p.id
    )
    and (
      coalesce(b.audience, 'all') = 'all'
      or (
        b.audience = 'people'
        and exists (
          select 1
          from public.people pe
          where pe.organization_id = b.organization_id
            and pe.profile_id = p.id
            and pe.id = any (coalesce(b.audience_person_ids, '{}'::uuid[]))
        )
      )
    )
  on conflict do nothing;

  drop policy if exists bulletin_dismissals_select on public.bulletin_dismissals;
  drop policy if exists bulletin_dismissals_insert on public.bulletin_dismissals;
  drop policy if exists bulletin_dismissals_delete on public.bulletin_dismissals;
  drop table public.bulletin_dismissals;
end $$;

-- ---------------------------------------------------------------------------
-- Mention unreads (per person — matches @mention targeting)
-- ---------------------------------------------------------------------------
create table if not exists public.mention_unreads (
  comment_id uuid not null references public.task_comments(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, person_id)
);

create index if not exists mention_unreads_person_idx
  on public.mention_unreads (person_id);

create index if not exists mention_unreads_org_idx
  on public.mention_unreads (organization_id);

alter table public.mention_unreads enable row level security;

drop policy if exists mention_unreads_select on public.mention_unreads;
create policy mention_unreads_select on public.mention_unreads for select
  using (
    organization_id = public.current_org_id()
    and (
      person_id = public.current_person_id()
      or public.current_role() in ('admin', 'manager')
    )
  );

drop policy if exists mention_unreads_insert on public.mention_unreads;
create policy mention_unreads_insert on public.mention_unreads for insert
  with check (
    organization_id = public.current_org_id()
    and (
      exists (
        select 1
        from public.task_comments c
        where c.id = comment_id
          and c.organization_id = organization_id
          and c.author_profile_id = auth.uid()
      )
      or public.current_role() in ('admin', 'manager')
      or person_id = public.current_person_id()
    )
  );

drop policy if exists mention_unreads_delete on public.mention_unreads;
create policy mention_unreads_delete on public.mention_unreads for delete
  using (
    organization_id = public.current_org_id()
    and (
      person_id = public.current_person_id()
      or public.current_role() in ('admin', 'manager')
    )
  );

alter table public.mention_unreads replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.mention_unreads;
exception
  when duplicate_object then null;
end $$;

-- Seed current mentions as unread; clients drop locally-dismissed ones once.
insert into public.mention_unreads (comment_id, person_id, organization_id)
select m.comment_id, m.person_id, m.organization_id
from public.task_comment_mentions m
on conflict do nothing;
