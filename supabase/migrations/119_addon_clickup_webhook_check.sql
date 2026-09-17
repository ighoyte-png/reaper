-- Throttle ClickUp webhook health checks on the drain cron (quiet orgs).

alter table public.addon_clickup_settings
  add column if not exists last_webhook_check_at timestamptz;
