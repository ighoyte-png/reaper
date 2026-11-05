-- When CU→Reaper inbound sets echo-suppress, Reaper edits that land inside the
-- window were dropped entirely (no outbox row). Defer upserts until suppress
-- expires so comment/task edits still sync to ClickUp.

create or replace function public.addon_clickup_enqueue(
  p_org uuid,
  p_entity_type text,
  p_reaper_id text,
  p_project_id uuid,
  p_op text,
  p_actor_profile_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  settings_on boolean;
  project_on boolean;
  suppress_until timestamptz;
  avail_at timestamptz := now();
begin
  select coalesce(enabled, false) into settings_on
  from public.addon_clickup_settings
  where organization_id = p_org;

  if not coalesce(settings_on, false) then
    return;
  end if;

  -- Deletes must always enqueue immediately; suppress is only for upsert echo.
  if p_op is distinct from 'delete' then
    select s.until into suppress_until
    from public.addon_clickup_suppress s
    where s.organization_id = p_org
      and s.entity_type = p_entity_type
      and s.reaper_id = p_reaper_id
      and s.until > now()
    limit 1;

    if suppress_until is not null then
      -- Small buffer so inbound apply finishes before we push the local edit.
      avail_at := suppress_until + interval '2 seconds';
    end if;
  end if;

  if p_project_id is not null then
    select coalesce(enabled, false) and not coalesce(reconciling, false)
      into project_on
    from public.addon_clickup_project_sync
    where organization_id = p_org and project_id = p_project_id;

    if not coalesce(project_on, false) then
      return;
    end if;
  end if;

  insert into public.addon_clickup_outbox (
    organization_id, entity_type, reaper_id, project_id, op, actor_profile_id, available_at
  ) values (
    p_org, p_entity_type, p_reaper_id, p_project_id, p_op, p_actor_profile_id, avail_at
  );
end;
$$;
