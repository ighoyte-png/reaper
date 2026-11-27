-- Orgs that already had ClickUp enabled before organization_addon_allowlist
-- shipped were blocked in the UI (missing row = not allowed). Backfill them.

insert into public.organization_addon_allowlist (
  organization_id,
  addon_key,
  allowed,
  updated_at
)
select
  s.organization_id,
  'clickup',
  true,
  now()
from public.addon_clickup_settings s
where s.enabled = true
on conflict (organization_id, addon_key) do update
set
  allowed = true,
  updated_at = excluded.updated_at;
