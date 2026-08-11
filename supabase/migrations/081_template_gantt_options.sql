-- Template Gantt options: dates, CR, dividers, assignees, list gantt flags.

alter table public.project_templates
  add column if not exists anchor_start_date date null;

alter table public.template_task_lists
  add column if not exists gantt_enabled boolean not null default false;

alter table public.template_task_lists
  add column if not exists start_date date null;

alter table public.template_task_lists
  add column if not exists end_date date null;

alter table public.template_tasks
  add column if not exists start_date date null;

alter table public.template_tasks
  add column if not exists due_date date null;

alter table public.template_tasks
  add column if not exists assignee_person_id text null;

alter table public.template_tasks
  add column if not exists is_client_review boolean not null default false;

alter table public.template_tasks
  add column if not exists is_divider boolean not null default false;

alter table public.template_milestones
  add column if not exists start_date date null;

alter table public.template_milestones
  add column if not exists due_date date null;
