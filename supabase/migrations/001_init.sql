-- Reaper Forecast MVP schema
create extension if not exists "pgcrypto";

create type public.app_role as enum ('admin', 'manager', 'member');
create type public.project_status as enum ('active', 'on_hold', 'completed', 'archived');
create type public.budget_mode as enum ('hours', 'amount', 'both');
create type public.assignment_status as enum ('tentative', 'confirmed');
create type public.leave_kind as enum ('vacation', 'holiday', 'sick', 'training');
create type public.leave_status as enum ('pending', 'approved');
create type public.milestone_status as enum ('upcoming', 'done', 'missed');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  full_name text not null,
  role public.app_role not null default 'member',
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  name text not null,
  status public.project_status not null default 'active',
  priority int not null default 3,
  color text not null default '#3B82F6',
  start_date date,
  end_date date,
  budget_hours numeric(10,2) not null,
  budget_amount numeric(12,2),
  budget_mode public.budget_mode not null default 'hours',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  due_date date not null,
  status public.milestone_status not null default 'upcoming',
  created_at timestamptz not null default now()
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  name text not null,
  role_title text not null default '',
  department text not null default '',
  office text not null default '',
  capacity_hours_week numeric(8,2) not null default 40,
  cost_rate numeric(10,2) not null default 0,
  bill_rate numeric(10,2) not null default 0,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now()
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  hours_per_day numeric(6,2) not null default 8,
  allocation_pct numeric(6,2),
  status public.assignment_status not null default 'confirmed',
  notes text not null default '',
  created_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (hours_per_day >= 0)
);

create table public.leave_days (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  date date not null,
  kind public.leave_kind not null default 'vacation',
  status public.leave_status not null default 'approved',
  created_at timestamptz not null default now(),
  unique (person_id, date)
);

create index assignments_org_date_idx on public.assignments (organization_id, start_date, end_date);
create index assignments_person_idx on public.assignments (person_id);
create index leave_days_person_idx on public.leave_days (person_id, date);
create index projects_org_idx on public.projects (organization_id);

create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.profiles where id = auth.uid()
$$;

create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.milestones enable row level security;
alter table public.people enable row level security;
alter table public.assignments enable row level security;
alter table public.leave_days enable row level security;

create policy org_select on public.organizations for select
  using (id = public.current_org_id());

create policy profiles_select on public.profiles for select
  using (organization_id = public.current_org_id());

create policy profiles_update_self on public.profiles for update
  using (id = auth.uid());

create policy clients_select on public.clients for select
  using (organization_id = public.current_org_id());
create policy clients_write on public.clients for all
  using (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'))
  with check (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'));

create policy projects_select on public.projects for select
  using (organization_id = public.current_org_id());
create policy projects_write on public.projects for all
  using (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'))
  with check (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'));

create policy milestones_select on public.milestones for select
  using (organization_id = public.current_org_id());
create policy milestones_write on public.milestones for all
  using (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'))
  with check (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'));

create policy people_select on public.people for select
  using (organization_id = public.current_org_id());
create policy people_write on public.people for all
  using (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'))
  with check (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'));

create policy assignments_select on public.assignments for select
  using (organization_id = public.current_org_id());
create policy assignments_write on public.assignments for all
  using (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'))
  with check (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'));

create policy leave_select on public.leave_days for select
  using (organization_id = public.current_org_id());
create policy leave_write on public.leave_days for all
  using (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'))
  with check (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'));
