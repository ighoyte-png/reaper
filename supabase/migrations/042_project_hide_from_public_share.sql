-- Allow hiding individual projects from the org-wide public share view.

alter table public.projects
  add column if not exists hide_from_public_share boolean not null default false;
