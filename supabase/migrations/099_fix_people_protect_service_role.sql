-- 096 rewrote protect_people_self_update_columns (drop bill_rate) and omitted
-- the service-role bypass from 080. Invite linking people.profile_id uses the
-- admin client; auth.uid() is null so current_role() is null and the trigger
-- raised "members may only update avatar fields on their own people row".

create or replace function public.protect_people_self_update_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.app_role;
begin
  if TG_OP <> 'UPDATE' then
    return new;
  end if;

  -- Service role / system writers (invite API, storage complete, etc.)
  if coalesce(auth.role(), '') = 'service_role' or auth.uid() is null then
    return new;
  end if;

  actor_role := public.current_role();
  if actor_role in ('admin', 'manager') then
    return new;
  end if;

  if new.profile_id is distinct from old.profile_id
    or new.organization_id is distinct from old.organization_id
    or new.name is distinct from old.name
    or new.role_title is distinct from old.role_title
    or new.department is distinct from old.department
    or new.office is distinct from old.office
    or new.capacity_hours_week is distinct from old.capacity_hours_week
    or new.cost_rate is distinct from old.cost_rate
    or new.timezone is distinct from old.timezone
    or new.email is distinct from old.email
    or coalesce(new.hide_from_schedule, false) is distinct from coalesce(old.hide_from_schedule, false)
    or coalesce(new.hide_from_utilization, false) is distinct from coalesce(old.hide_from_utilization, false)
    or coalesce(new.is_contractor, false) is distinct from coalesce(old.is_contractor, false)
    or new.holiday_calendar_id is distinct from old.holiday_calendar_id
  then
    raise exception 'members may only update avatar fields on their own people row';
  end if;

  return new;
end;
$$;
