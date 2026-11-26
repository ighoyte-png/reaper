-- Shrink Realtime WAL old-row images: REPLICA IDENTITY FULL → USING INDEX.
-- Keeps filtered postgres_changes working (organization_id / project_id /
-- recipient_profile_id) without shipping full HTML notes/bodies in OLD tuples.
-- NEW row images are unchanged (Postgres logical decoding always sends them).

-- ---------------------------------------------------------------------------
-- UUID PK tables filtered by organization_id (and project_id where used)
-- ---------------------------------------------------------------------------

create unique index if not exists assignments_realtime_ri_idx
  on public.assignments (id, organization_id);

alter table public.assignments
  replica identity using index assignments_realtime_ri_idx;

create unique index if not exists leave_days_realtime_ri_idx
  on public.leave_days (id, organization_id);

alter table public.leave_days
  replica identity using index leave_days_realtime_ri_idx;

create unique index if not exists tasks_realtime_ri_idx
  on public.tasks (id, organization_id, project_id);

alter table public.tasks
  replica identity using index tasks_realtime_ri_idx;

create unique index if not exists task_lists_realtime_ri_idx
  on public.task_lists (id, organization_id, project_id);

alter table public.task_lists
  replica identity using index task_lists_realtime_ri_idx;

create unique index if not exists task_comments_realtime_ri_idx
  on public.task_comments (id, organization_id);

alter table public.task_comments
  replica identity using index task_comments_realtime_ri_idx;

create unique index if not exists bulletins_realtime_ri_idx
  on public.bulletins (id, organization_id);

alter table public.bulletins
  replica identity using index bulletins_realtime_ri_idx;

create unique index if not exists milestones_realtime_ri_idx
  on public.milestones (id, organization_id, project_id);

alter table public.milestones
  replica identity using index milestones_realtime_ri_idx;

create unique index if not exists project_assets_realtime_ri_idx
  on public.project_assets (id, organization_id, project_id);

alter table public.project_assets
  replica identity using index project_assets_realtime_ri_idx;

create unique index if not exists pods_realtime_ri_idx
  on public.pods (id, organization_id);

alter table public.pods
  replica identity using index pods_realtime_ri_idx;

create unique index if not exists organization_emojis_realtime_ri_idx
  on public.organization_emojis (id, organization_id);

alter table public.organization_emojis
  replica identity using index organization_emojis_realtime_ri_idx;

-- notifications: org channel may filter by recipient_profile_id or organization_id
create unique index if not exists notifications_realtime_ri_idx
  on public.notifications (id, organization_id, recipient_profile_id);

alter table public.notifications
  replica identity using index notifications_realtime_ri_idx;

-- ---------------------------------------------------------------------------
-- Composite PK tables: PK cols + organization_id for org filters
-- ---------------------------------------------------------------------------

create unique index if not exists task_comment_mentions_realtime_ri_idx
  on public.task_comment_mentions (comment_id, person_id, organization_id);

alter table public.task_comment_mentions
  replica identity using index task_comment_mentions_realtime_ri_idx;

create unique index if not exists task_comment_reactions_realtime_ri_idx
  on public.task_comment_reactions (comment_id, profile_id, emoji, organization_id);

alter table public.task_comment_reactions
  replica identity using index task_comment_reactions_realtime_ri_idx;

create unique index if not exists bulletin_dismissals_realtime_ri_idx
  on public.bulletin_dismissals (bulletin_id, profile_id, organization_id);

alter table public.bulletin_dismissals
  replica identity using index bulletin_dismissals_realtime_ri_idx;

create unique index if not exists bulletin_unreads_realtime_ri_idx
  on public.bulletin_unreads (bulletin_id, profile_id, organization_id);

alter table public.bulletin_unreads
  replica identity using index bulletin_unreads_realtime_ri_idx;

-- comment_id/task_id/assignment_id are nullable (095); RI index cols must be NOT NULL.
drop index if exists public.mention_unreads_realtime_ri_idx;
create unique index if not exists mention_unreads_realtime_ri_idx
  on public.mention_unreads (id, organization_id);

alter table public.mention_unreads
  replica identity using index mention_unreads_realtime_ri_idx;

create unique index if not exists task_thread_unreads_realtime_ri_idx
  on public.task_thread_unreads (task_id, person_id, organization_id);

alter table public.task_thread_unreads
  replica identity using index task_thread_unreads_realtime_ri_idx;

create unique index if not exists task_assigned_unreads_realtime_ri_idx
  on public.task_assigned_unreads (task_id, person_id, organization_id);

alter table public.task_assigned_unreads
  replica identity using index task_assigned_unreads_realtime_ri_idx;

create unique index if not exists assignment_bound_tasks_realtime_ri_idx
  on public.assignment_bound_tasks (assignment_id, task_id, organization_id);

alter table public.assignment_bound_tasks
  replica identity using index assignment_bound_tasks_realtime_ri_idx;

create unique index if not exists pod_members_realtime_ri_idx
  on public.pod_members (pod_id, person_id, organization_id);

alter table public.pod_members
  replica identity using index pod_members_realtime_ri_idx;
