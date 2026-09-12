-- Allow Reaper deletes to reach ClickUp even when inbound suppress is active.
-- CU→Reaper import sets suppress so our write does not bounce back; that was
-- also swallowing delete outbox rows and leaving orphan ClickUp tasks.

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
  suppressed boolean;
begin
  select coalesce(enabled, false) into settings_on
  from public.addon_clickup_settings
  where organization_id = p_org;

  if not coalesce(settings_on, false) then
    return;
  end if;

  -- Deletes must always enqueue; suppress is only for upsert echo from inbound.
  if p_op is distinct from 'delete' then
    select exists (
      select 1 from public.addon_clickup_suppress s
      where s.organization_id = p_org
        and s.entity_type = p_entity_type
        and s.reaper_id = p_reaper_id
        and s.until > now()
    ) into suppressed;

    if suppressed then
      return;
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
    organization_id, entity_type, reaper_id, project_id, op, actor_profile_id
  ) values (
    p_org, p_entity_type, p_reaper_id, p_project_id, p_op, p_actor_profile_id
  );
end;
$$;
