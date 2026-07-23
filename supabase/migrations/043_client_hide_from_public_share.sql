-- Allow hiding individual clients from the org-wide public share view.

alter table public.clients
  add column if not exists hide_from_public_share boolean not null default false;
