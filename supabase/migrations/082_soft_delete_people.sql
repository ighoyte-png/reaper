-- Soft-delete people: keep historical tasks/comments when removing a teammate.
-- Auth delete still cascades profiles; comments must SET NULL instead of CASCADE.

alter table public.people
  add column if not exists deleted_at timestamptz null;

create index if not exists people_org_active_idx
  on public.people (organization_id)
  where deleted_at is null;

-- Preserve comments when the author's profile/Auth user is removed.
alter table public.task_comments
  alter column author_profile_id drop not null;

alter table public.task_comments
  drop constraint if exists task_comments_author_profile_id_fkey;

alter table public.task_comments
  add constraint task_comments_author_profile_id_fkey
  foreign key (author_profile_id)
  references public.profiles(id)
  on delete set null;
