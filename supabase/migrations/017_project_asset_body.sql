-- Project assets: optional note body (for text-note assets, in addition to link assets)
alter table public.project_assets
  add column if not exists body text not null default '';
