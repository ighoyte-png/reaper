-- Holiday calendars (e.g. US vs Canada) assignable to people.
-- Leave kinds stay as vacation/holiday/sick/training in the DB enum;
-- the app labels vacation as PTO and holiday as Statutory.

create table public.holiday_calendars (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  region text not null default '',
  created_at timestamptz not null default now()
);

create table public.holiday_calendar_days (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  calendar_id uuid not null references public.holiday_calendars(id) on delete cascade,
  date date not null,
  name text not null default '',
  created_at timestamptz not null default now(),
  unique (calendar_id, date)
);

alter table public.people
  add column if not exists holiday_calendar_id uuid
    references public.holiday_calendars(id) on delete set null;

create index holiday_calendars_org_idx on public.holiday_calendars (organization_id);
create index holiday_calendar_days_cal_idx on public.holiday_calendar_days (calendar_id, date);
create index people_holiday_calendar_idx on public.people (holiday_calendar_id);

alter table public.holiday_calendars enable row level security;
alter table public.holiday_calendar_days enable row level security;

create policy holiday_calendars_select on public.holiday_calendars for select
  using (organization_id = public.current_org_id());
create policy holiday_calendars_write on public.holiday_calendars for all
  using (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'))
  with check (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'));

create policy holiday_calendar_days_select on public.holiday_calendar_days for select
  using (organization_id = public.current_org_id());
create policy holiday_calendar_days_write on public.holiday_calendar_days for all
  using (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'))
  with check (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'));

-- Clear calendars when resetting demo org data.
create or replace function public.clear_organization_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid;
  r public.app_role;
begin
  org := public.current_org_id();
  r := public.current_role();
  if org is null then
    raise exception 'No organization';
  end if;
  if r is distinct from 'admin' and r is distinct from 'manager' then
    raise exception 'Not allowed';
  end if;

  delete from public.assignments where organization_id = org;
  delete from public.leave_days where organization_id = org;
  delete from public.milestones where organization_id = org;
  delete from public.projects where organization_id = org;
  delete from public.clients where organization_id = org;
  -- Null calendar refs before deleting people, then calendars.
  update public.people set holiday_calendar_id = null where organization_id = org;
  delete from public.people where organization_id = org;
  delete from public.holiday_calendar_days where organization_id = org;
  delete from public.holiday_calendars where organization_id = org;
end;
$$;
