-- Contractor flag, split utilization hide, and per-project contractor terms.

alter table public.people
  add column if not exists is_contractor boolean not null default false;

alter table public.people
  add column if not exists hide_from_utilization boolean not null default false;

-- Preserve prior combined hide_from_schedule behavior (gated schedule + util).
update public.people
set hide_from_utilization = hide_from_schedule
where hide_from_utilization = false
  and hide_from_schedule = true;

alter table public.project_members
  add column if not exists contractor_mode text null;

alter table public.project_members
  add column if not exists contractor_fixed_fee numeric null;

alter table public.project_members
  add column if not exists contractor_hours numeric null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'project_members_contractor_mode_check'
  ) then
    alter table public.project_members
      add constraint project_members_contractor_mode_check
      check (
        contractor_mode is null
        or contractor_mode in ('fixed_fee', 'hours', 'scheduled')
      );
  end if;
end $$;

-- Members may only update avatar fields on their own people row.
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
    or new.bill_rate is distinct from old.bill_rate
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
