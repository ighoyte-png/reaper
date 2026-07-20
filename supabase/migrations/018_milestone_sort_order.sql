-- Milestone display order (independent of due date)
alter table public.milestones
  add column if not exists sort_order int not null default 0;

with ordered as (
  select
    id,
    (row_number() over (
      partition by project_id
      order by due_date, created_at, id
    ) - 1)::int as rn
  from public.milestones
)
update public.milestones m
set sort_order = ordered.rn
from ordered
where m.id = ordered.id;
