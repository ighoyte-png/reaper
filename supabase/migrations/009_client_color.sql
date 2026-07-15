alter table public.clients
  add column if not exists color text not null default '#64748B';
