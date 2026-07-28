-- Assignment latest-edit audit (single latest values, not a history table).

alter table public.assignments
  add column if not exists edited_at timestamptz,
  add column if not exists edited_by_profile_id uuid references public.profiles(id) on delete set null;

create index if not exists assignments_edited_by_profile_idx
  on public.assignments (edited_by_profile_id);
