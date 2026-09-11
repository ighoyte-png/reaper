-- Prevent duplicate Reaper tasks for the same ClickUp id (inbound create races).

-- If earlier races wrote multiple link rows for one clickup_id, keep the oldest.
with ranked as (
  select
    organization_id,
    entity_type,
    reaper_id,
    row_number() over (
      partition by organization_id, entity_type, clickup_id
      order by updated_at asc nulls last, reaper_id asc
    ) as rn
  from public.addon_clickup_links
)
delete from public.addon_clickup_links l
using ranked r
where l.organization_id = r.organization_id
  and l.entity_type = r.entity_type
  and l.reaper_id = r.reaper_id
  and r.rn > 1;

create unique index if not exists addon_clickup_links_clickup_uidx
  on public.addon_clickup_links (organization_id, entity_type, clickup_id);
