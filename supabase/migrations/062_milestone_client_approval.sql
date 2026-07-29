-- Milestone client approval: essentials link, contact gating, client sign-off
alter table public.milestones
  add column if not exists approval_enabled boolean not null default false,
  add column if not exists approval_name text not null default '',
  add column if not exists approval_email text not null default '',
  add column if not exists essential_kind public.project_asset_kind,
  add column if not exists essential_label text not null default '',
  add column if not exists essential_url text not null default '',
  add column if not exists approved_by_name text,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by_client boolean not null default false;

-- Hide task lists from client portal
alter table public.task_lists
  add column if not exists hide_from_client boolean not null default false;

-- Success-tone bulletins (milestone approval celebrations)
alter table public.bulletins
  add column if not exists tone text not null default 'default';

alter table public.bulletins
  drop constraint if exists bulletins_tone_check;

alter table public.bulletins
  add constraint bulletins_tone_check
  check (tone in ('default', 'success'));
