-- Bulletin audience: all org users, or selected people
alter table public.bulletins
  add column if not exists audience text not null default 'all'
    check (audience in ('all', 'people')),
  add column if not exists audience_person_ids uuid[] not null default '{}';
