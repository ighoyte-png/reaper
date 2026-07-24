-- Task authorship, latest edit, and latest status-change audit
-- (single latest values, not a history table).

alter table public.tasks
  add column if not exists created_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists edited_at timestamptz,
  add column if not exists edited_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by_profile_id uuid references public.profiles(id) on delete set null;

create index if not exists tasks_created_by_profile_idx
  on public.tasks (created_by_profile_id);

create index if not exists tasks_edited_by_profile_idx
  on public.tasks (edited_by_profile_id);

create index if not exists tasks_status_changed_by_profile_idx
  on public.tasks (status_changed_by_profile_id);
