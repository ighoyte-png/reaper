import type { SupabaseClient } from "@supabase/supabase-js";
import { createDemoSeed } from "@/lib/demo/seed";
import { orderTasksParentsFirst } from "@/lib/domain/tasks";
import type {
  Assignment,
  Bulletin,
  Client,
  DemoState,
  HolidayCalendar,
  HolidayCalendarDay,
  LeaveDay,
  Milestone,
  Organization,
  Person,
  Profile,
  Project,
  ProjectAsset,
  ProjectMember,
  ProjectTemplate,
  Task,
  TaskComment,
  TaskList,
  TemplateMilestone,
  TemplateTask,
  TemplateTaskList,
} from "@/lib/types";

function num(value: unknown, fallback = 0): number {
  if (typeof value === "number") return value;
  if (value == null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function mapProject(row: Record<string, unknown>): Project {
  const rawHours =
    row.budget_hours == null || row.budget_hours === ""
      ? null
      : num(row.budget_hours);
  const rawAmount =
    row.budget_amount == null || row.budget_amount === ""
      ? null
      : num(row.budget_amount);
  const rawMode = String(row.budget_mode ?? "");
  const budget_mode: Project["budget_mode"] =
    rawMode === "none" || rawMode === "hours" || rawMode === "amount"
      ? rawMode
      : rawMode === "both"
        ? (rawHours ?? 0) > 0
          ? "hours"
          : rawAmount != null && rawAmount > 0
            ? "amount"
            : "none"
        : (rawHours ?? 0) > 0
          ? "hours"
          : rawAmount != null
            ? "amount"
            : "hours";

  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    client_id: row.client_id ? String(row.client_id) : null,
    name: String(row.name ?? ""),
    slug:
      (row.slug ? String(row.slug) : "") ||
      String(row.name ?? "project")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") ||
      String(row.id).slice(0, 8),
    status: row.status as Project["status"],
    priority: num(row.priority, 3),
    color: String(row.color ?? "#3B82F6"),
    start_date: row.start_date ? String(row.start_date) : null,
    end_date: row.end_date ? String(row.end_date) : null,
    budget_hours: budget_mode === "hours" ? (rawHours ?? 0) : null,
    budget_amount: budget_mode === "amount" ? rawAmount : null,
    budget_mode,
    budget_monthly_reset: Boolean(row.budget_monthly_reset),
    notes: String(row.notes ?? ""),
    manager_person_id: row.manager_person_id
      ? String(row.manager_person_id)
      : null,
    share_enabled: Boolean(row.share_enabled),
    share_token: row.share_token ? String(row.share_token) : null,
    hide_from_public_share: Boolean(row.hide_from_public_share),
  };
}

function mapClient(row: Record<string, unknown>): Client {
  const status = row.status === "archived" ? "archived" : "active";
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    name: String(row.name ?? ""),
    slug:
      (row.slug ? String(row.slug) : "") ||
      String(row.name ?? "client")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") ||
      String(row.id).slice(0, 8),
    notes: String(row.notes ?? ""),
    color: String(row.color ?? "#64748B"),
    status,
    hide_from_public_share: Boolean(row.hide_from_public_share),
    contact_first_name: String(row.contact_first_name ?? ""),
    contact_last_name: String(row.contact_last_name ?? ""),
    contact_email: String(row.contact_email ?? ""),
    contact_phone: String(row.contact_phone ?? ""),
    company_website: String(row.company_website ?? ""),
  };
}

export function mapMilestone(row: Record<string, unknown>): Milestone {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    project_id: String(row.project_id),
    name: String(row.name ?? ""),
    start_date: row.start_date ? String(row.start_date) : null,
    due_date: row.due_date ? String(row.due_date) : null,
    status: row.status as Milestone["status"],
    client_approved: Boolean(row.client_approved),
    sort_order: num(row.sort_order),
  };
}

export function mapProjectAsset(row: Record<string, unknown>): ProjectAsset {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    project_id: String(row.project_id),
    kind: (row.kind as ProjectAsset["kind"]) ?? "custom",
    label: String(row.label ?? ""),
    url: String(row.url ?? ""),
    body: String(row.body ?? ""),
    sort_order: num(row.sort_order),
    hide_from_client: Boolean(row.hide_from_client),
  };
}

function mapTaskList(row: Record<string, unknown>): TaskList {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    project_id: String(row.project_id),
    milestone_id: row.milestone_id ? String(row.milestone_id) : null,
    name: String(row.name ?? ""),
    color: row.color ? String(row.color) : null,
    sort_order: num(row.sort_order),
    archived: Boolean(row.archived),
  };
}

export function mapTask(row: Record<string, unknown>): Task {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    project_id: String(row.project_id),
    list_id: String(row.list_id),
    parent_id: row.parent_id ? String(row.parent_id) : null,
    assignee_person_id: row.assignee_person_id
      ? String(row.assignee_person_id)
      : null,
    title: String(row.title ?? ""),
    status: (row.status as Task["status"]) ?? "upcoming",
    start_date: row.start_date ? String(row.start_date) : null,
    due_date: row.due_date ? String(row.due_date) : null,
    notes: String(row.notes ?? ""),
    sort_order: num(row.sort_order),
  };
}

export function mapTaskComment(row: Record<string, unknown>): TaskComment {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    task_id: String(row.task_id),
    author_profile_id: String(row.author_profile_id),
    body: String(row.body ?? ""),
    created_at: String(row.created_at ?? ""),
    updated_at: row.updated_at ? String(row.updated_at) : null,
    mentioned_person_ids: [],
    reactions: [],
  };
}

export function mapBulletin(row: Record<string, unknown>): Bulletin {
  const audienceRaw = String(row.audience ?? "all");
  const audience = audienceRaw === "people" ? "people" : "all";
  const ids = Array.isArray(row.audience_person_ids)
    ? (row.audience_person_ids as unknown[]).map(String)
    : [];
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    project_id: row.project_id ? String(row.project_id) : null,
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    pinned: Boolean(row.pinned),
    audience,
    audience_person_ids: ids,
    created_by_profile_id: row.created_by_profile_id
      ? String(row.created_by_profile_id)
      : null,
    created_at: String(row.created_at ?? ""),
  };
}

function mapProjectTemplate(row: Record<string, unknown>): ProjectTemplate {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
  };
}

function mapTemplateMilestone(row: Record<string, unknown>): TemplateMilestone {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    template_id: String(row.template_id),
    name: String(row.name ?? ""),
    offset_days: num(row.offset_days),
    sort_order: num(row.sort_order),
  };
}

function mapTemplateTaskList(row: Record<string, unknown>): TemplateTaskList {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    template_id: String(row.template_id),
    template_milestone_id: row.template_milestone_id
      ? String(row.template_milestone_id)
      : null,
    name: String(row.name ?? ""),
    sort_order: num(row.sort_order),
  };
}

function mapTemplateTask(row: Record<string, unknown>): TemplateTask {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    template_id: String(row.template_id),
    list_id: String(row.list_id),
    parent_id: row.parent_id ? String(row.parent_id) : null,
    title: String(row.title ?? ""),
    notes: String(row.notes ?? ""),
    offset_days: row.offset_days == null ? null : num(row.offset_days),
    sort_order: num(row.sort_order),
  };
}

function mapPerson(row: Record<string, unknown>): Person {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    profile_id: row.profile_id ? String(row.profile_id) : null,
    name: String(row.name ?? ""),
    email: String(row.email ?? ""),
    role_title: String(row.role_title ?? ""),
    department: String(row.department ?? ""),
    office: String(row.office ?? ""),
    capacity_hours_week: num(row.capacity_hours_week, 40),
    cost_rate: num(row.cost_rate),
    bill_rate: num(row.bill_rate),
    timezone: String(row.timezone ?? "UTC"),
    holiday_calendar_id: row.holiday_calendar_id
      ? String(row.holiday_calendar_id)
      : null,
    avatar_url: row.avatar_url ? String(row.avatar_url) : null,
  };
}

export function mapAssignment(row: Record<string, unknown>): Assignment {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    person_id: String(row.person_id),
    project_id: String(row.project_id),
    start_date: String(row.start_date),
    end_date: String(row.end_date),
    hours_per_day: num(row.hours_per_day),
    allocation_pct:
      row.allocation_pct == null ? null : num(row.allocation_pct),
    status: (row.status as Assignment["status"]) ?? "confirmed",
    notes: String(row.notes ?? ""),
    recurrence:
      row.recurrence === "weekly" ? "weekly" : "none",
    recurrence_end_date: row.recurrence_end_date
      ? String(row.recurrence_end_date)
      : null,
    recurrence_exceptions: Array.isArray(row.recurrence_exceptions)
      ? (row.recurrence_exceptions as unknown[]).map(String)
      : [],
  };
}

export function mapLeaveDay(row: Record<string, unknown>): LeaveDay {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    person_id: String(row.person_id),
    date: String(row.date),
    kind: row.kind as LeaveDay["kind"],
    status: row.status as LeaveDay["status"],
    hours_per_day:
      row.hours_per_day == null || row.hours_per_day === ""
        ? null
        : Number(row.hours_per_day),
    notes: String(row.notes ?? ""),
  };
}

function emptyWorkspace(): DemoState {
  return {
    organization: { id: "", name: "", slug: "" },
    profiles: [],
    clients: [],
    projects: [],
    milestones: [],
    people: [],
    assignments: [],
    project_members: [],
    leave_days: [],
    holiday_calendars: [],
    holiday_calendar_days: [],
    project_assets: [],
    task_lists: [],
    tasks: [],
    task_comments: [],
    bulletins: [],
    unread_bulletin_ids: [],
    unread_mentions: [],
    project_templates: [],
    template_milestones: [],
    template_task_lists: [],
    template_tasks: [],
    sessionProfileId: null,
  };
}

/** Create org/profile if the auth user has none (common after email confirm). */
export async function ensureProfileForUser(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> },
): Promise<boolean> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (profile) return false;

  const meta = user.user_metadata ?? {};
  const fullName =
    (typeof meta.full_name === "string" && meta.full_name) ||
    user.email?.split("@")[0] ||
    "Owner";
  const orgName =
    (typeof meta.org_name === "string" && meta.org_name) || "My workspace";

  await bootstrapOrganization(supabase, orgName, fullName);
  return true;
}

export type ProjectDataBundle = {
  milestones: Milestone[];
  task_lists: TaskList[];
  tasks: Task[];
  task_comments: TaskComment[];
  project_assets: ProjectAsset[];
  assignments: Assignment[];
};

export type OrgHeavyData = {
  milestones: Milestone[];
  assignments: Assignment[];
  leave_days: LeaveDay[];
  project_assets: ProjectAsset[];
  task_lists: TaskList[];
  tasks: Task[];
  task_comments: TaskComment[];
};

function attachCommentExtras(
  commentsRaw: TaskComment[],
  mentionsRes: { data: unknown[] | null; error: { message: string; code?: string } | null },
  reactionsRes: { data: unknown[] | null; error: { message: string; code?: string } | null },
): TaskComment[] {
  const mentionByComment = new Map<string, string[]>();
  if (!mentionsRes.error) {
    for (const row of mentionsRes.data ?? []) {
      const cid = String((row as { comment_id: unknown }).comment_id);
      const pid = String((row as { person_id: unknown }).person_id);
      const list = mentionByComment.get(cid) ?? [];
      list.push(pid);
      mentionByComment.set(cid, list);
    }
  }
  const reactionsByComment = new Map<
    string,
    { emoji: string; profile_id: string }[]
  >();
  if (!reactionsRes.error) {
    for (const row of reactionsRes.data ?? []) {
      const cid = String((row as { comment_id: unknown }).comment_id);
      const emoji = String((row as { emoji: unknown }).emoji ?? "");
      const profile_id = String((row as { profile_id: unknown }).profile_id);
      if (!emoji || !profile_id) continue;
      const list = reactionsByComment.get(cid) ?? [];
      list.push({ emoji, profile_id });
      reactionsByComment.set(cid, list);
    }
  } else if (
    /relation .*task_comment_reactions.* does not exist/i.test(
      reactionsRes.error.message,
    ) ||
    reactionsRes.error.code === "42P01"
  ) {
    console.warn(
      "task_comment_reactions missing — apply supabase/migrations/036_task_comment_reactions.sql",
    );
  }
  return commentsRaw.map((c) => ({
    ...c,
    mentioned_person_ids: mentionByComment.get(c.id) ?? [],
    reactions: reactionsByComment.get(c.id) ?? [],
  }));
}

export async function fetchWorkspace(
  supabase: SupabaseClient,
  userId: string,
): Promise<DemoState> {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) {
    return { ...emptyWorkspace(), sessionProfileId: null };
  }

  const orgId = profile.organization_id as string;
  return loadOrgBootstrap(supabase, orgId, userId);
}

/** Thin shell: org, people, clients, projects, templates — no tasks/assignments. */
export async function loadOrgBootstrap(
  supabase: SupabaseClient,
  orgId: string,
  sessionProfileId: string | null,
): Promise<DemoState> {
  const [
    orgRes,
    profilesRes,
    clientsRes,
    projectsRes,
    peopleRes,
    projectMembersRes,
    calendarsRes,
    calendarDaysRes,
    bulletinsRes,
    bulletinUnreadsRes,
    mentionUnreadsRes,
    projectTemplatesRes,
    templateMilestonesRes,
    templateTaskListsRes,
    templateTasksRes,
  ] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", orgId).single(),
    supabase.from("profiles").select("*").eq("organization_id", orgId),
    supabase.from("clients").select("*").eq("organization_id", orgId),
    supabase.from("projects").select("*").eq("organization_id", orgId),
    supabase.from("people").select("*").eq("organization_id", orgId),
    supabase.from("project_members").select("*").eq("organization_id", orgId),
    supabase.from("holiday_calendars").select("*").eq("organization_id", orgId),
    supabase
      .from("holiday_calendar_days")
      .select("*")
      .eq("organization_id", orgId),
    supabase.from("bulletins").select("*").eq("organization_id", orgId),
    sessionProfileId
      ? supabase
          .from("bulletin_unreads")
          .select("bulletin_id")
          .eq("organization_id", orgId)
          .eq("profile_id", sessionProfileId)
      : Promise.resolve({ data: [] as { bulletin_id: unknown }[], error: null }),
    supabase
      .from("mention_unreads")
      .select("comment_id, person_id")
      .eq("organization_id", orgId),
    supabase
      .from("project_templates")
      .select("*")
      .eq("organization_id", orgId),
    supabase
      .from("template_milestones")
      .select("*")
      .eq("organization_id", orgId),
    supabase
      .from("template_task_lists")
      .select("*")
      .eq("organization_id", orgId),
    supabase.from("template_tasks").select("*").eq("organization_id", orgId),
  ]);

  for (const res of [orgRes, profilesRes, clientsRes, projectsRes, peopleRes]) {
    if (res.error) throw res.error;
  }

  const holiday_calendars: HolidayCalendar[] = calendarsRes.error
    ? []
    : (calendarsRes.data ?? []).map((row) => ({
        id: String(row.id),
        organization_id: String(row.organization_id),
        name: String(row.name ?? ""),
        region: String(row.region ?? ""),
      }));
  const holiday_calendar_days: HolidayCalendarDay[] = calendarDaysRes.error
    ? []
    : (calendarDaysRes.data ?? []).map((row) => ({
        id: String(row.id),
        organization_id: String(row.organization_id),
        calendar_id: String(row.calendar_id),
        date: String(row.date),
        name: String(row.name ?? ""),
      }));

  const project_members: ProjectMember[] = projectMembersRes.error
    ? []
    : (projectMembersRes.data ?? []).map((row) => ({
        project_id: String((row as { project_id: unknown }).project_id),
        person_id: String((row as { person_id: unknown }).person_id),
        organization_id: String(
          (row as { organization_id: unknown }).organization_id,
        ),
      }));

  const bulletins: Bulletin[] = bulletinsRes.error
    ? []
    : (bulletinsRes.data ?? []).map((row) =>
        mapBulletin(row as Record<string, unknown>),
      );
  let unread_bulletin_ids: string[] = [];
  if (bulletinUnreadsRes.error) {
    if (
      /relation .*bulletin_unreads.* does not exist/i.test(
        bulletinUnreadsRes.error.message,
      ) ||
      bulletinUnreadsRes.error.code === "42P01"
    ) {
      console.warn(
        "bulletin_unreads missing — apply supabase/migrations/044_notification_unreads.sql",
      );
    }
  } else {
    unread_bulletin_ids = (bulletinUnreadsRes.data ?? [])
      .map((row) => String((row as { bulletin_id: unknown }).bulletin_id))
      .filter(Boolean);
  }
  let unread_mentions: { comment_id: string; person_id: string }[] = [];
  if (mentionUnreadsRes.error) {
    if (
      /relation .*mention_unreads.* does not exist/i.test(
        mentionUnreadsRes.error.message,
      ) ||
      mentionUnreadsRes.error.code === "42P01"
    ) {
      console.warn(
        "mention_unreads missing — apply supabase/migrations/044_notification_unreads.sql",
      );
    }
  } else {
    unread_mentions = (mentionUnreadsRes.data ?? [])
      .map((row) => ({
        comment_id: String((row as { comment_id: unknown }).comment_id),
        person_id: String((row as { person_id: unknown }).person_id),
      }))
      .filter((r) => r.comment_id && r.person_id);
  }
  const project_templates: ProjectTemplate[] = projectTemplatesRes.error
    ? []
    : (projectTemplatesRes.data ?? []).map((row) =>
        mapProjectTemplate(row as Record<string, unknown>),
      );
  const template_milestones: TemplateMilestone[] = templateMilestonesRes.error
    ? []
    : (templateMilestonesRes.data ?? []).map((row) =>
        mapTemplateMilestone(row as Record<string, unknown>),
      );
  const template_task_lists: TemplateTaskList[] = templateTaskListsRes.error
    ? []
    : (templateTaskListsRes.data ?? []).map((row) =>
        mapTemplateTaskList(row as Record<string, unknown>),
      );
  const template_tasks: TemplateTask[] = templateTasksRes.error
    ? []
    : (templateTasksRes.data ?? []).map((row) =>
        mapTemplateTask(row as Record<string, unknown>),
      );

  const organization = orgRes.data as Organization;

  return {
    organization: {
      id: organization.id,
      name: organization.name,
      slug:
        String((organization as { slug?: string }).slug ?? "") ||
        String(organization.name ?? "workspace")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") ||
        String(organization.id).slice(0, 8),
      disabled_at:
        (organization as { disabled_at?: string | null }).disabled_at ?? null,
      share_enabled: Boolean(
        (organization as { share_enabled?: boolean }).share_enabled,
      ),
    },
    profiles: (profilesRes.data ?? []).map((row) => ({
      id: String(row.id),
      organization_id: String(row.organization_id),
      email: String(row.email ?? ""),
      full_name: String(row.full_name ?? ""),
      role: row.role as Profile["role"],
    })),
    clients: (clientsRes.data ?? []).map((row) =>
      mapClient(row as Record<string, unknown>),
    ),
    projects: (projectsRes.data ?? []).map((row) =>
      mapProject(row as Record<string, unknown>),
    ),
    milestones: [],
    people: (peopleRes.data ?? []).map((row) =>
      mapPerson(row as Record<string, unknown>),
    ),
    assignments: [],
    project_members,
    leave_days: [],
    holiday_calendars,
    holiday_calendar_days,
    project_assets: [],
    task_lists: [],
    tasks: [],
    task_comments: [],
    bulletins,
    unread_bulletin_ids,
    unread_mentions,
    project_templates,
    template_milestones,
    template_task_lists,
    template_tasks,
    sessionProfileId,
  };
}

/** Org-wide planning + PM rows (transitional until page-scoped fetches cover all callers). */
export async function loadOrgHeavyData(
  supabase: SupabaseClient,
  orgId: string,
): Promise<OrgHeavyData> {
  const [
    milestonesRes,
    assignmentsRes,
    leaveRes,
    projectAssetsRes,
    taskListsRes,
    tasksRes,
    taskCommentsRes,
    taskCommentMentionsRes,
    taskCommentReactionsRes,
  ] = await Promise.all([
    supabase.from("milestones").select("*").eq("organization_id", orgId),
    supabase.from("assignments").select("*").eq("organization_id", orgId),
    supabase.from("leave_days").select("*").eq("organization_id", orgId),
    supabase.from("project_assets").select("*").eq("organization_id", orgId),
    supabase.from("task_lists").select("*").eq("organization_id", orgId),
    supabase.from("tasks").select("*").eq("organization_id", orgId),
    supabase.from("task_comments").select("*").eq("organization_id", orgId),
    supabase
      .from("task_comment_mentions")
      .select("*")
      .eq("organization_id", orgId),
    supabase
      .from("task_comment_reactions")
      .select("*")
      .eq("organization_id", orgId),
  ]);

  for (const res of [milestonesRes, assignmentsRes, leaveRes]) {
    if (res.error) throw res.error;
  }

  const project_assets: ProjectAsset[] = projectAssetsRes.error
    ? []
    : (projectAssetsRes.data ?? []).map((row) =>
        mapProjectAsset(row as Record<string, unknown>),
      );
  const task_lists: TaskList[] = taskListsRes.error
    ? []
    : (taskListsRes.data ?? []).map((row) =>
        mapTaskList(row as Record<string, unknown>),
      );
  const tasks: Task[] = tasksRes.error
    ? []
    : (tasksRes.data ?? []).map((row) =>
        mapTask(row as Record<string, unknown>),
      );
  const task_commentsRaw: TaskComment[] = taskCommentsRes.error
    ? []
    : (taskCommentsRes.data ?? []).map((row) =>
        mapTaskComment(row as Record<string, unknown>),
      );

  return {
    milestones: (milestonesRes.data ?? []).map((row) =>
      mapMilestone(row as Record<string, unknown>),
    ),
    assignments: (assignmentsRes.data ?? []).map((row) =>
      mapAssignment(row as Record<string, unknown>),
    ),
    leave_days: (leaveRes.data ?? []).map((row) =>
      mapLeaveDay(row as Record<string, unknown>),
    ),
    project_assets,
    task_lists,
    tasks,
    task_comments: attachCommentExtras(
      task_commentsRaw,
      taskCommentMentionsRes,
      taskCommentReactionsRes,
    ),
  };
}

/** Project hub / schedule tasks sidebar bundle. */
export async function loadProjectData(
  supabase: SupabaseClient,
  orgId: string,
  projectId: string,
): Promise<ProjectDataBundle> {
  const [
    milestonesRes,
    taskListsRes,
    tasksRes,
    projectAssetsRes,
    assignmentsRes,
  ] = await Promise.all([
    supabase
      .from("milestones")
      .select("*")
      .eq("organization_id", orgId)
      .eq("project_id", projectId),
    supabase
      .from("task_lists")
      .select("*")
      .eq("organization_id", orgId)
      .eq("project_id", projectId),
    supabase
      .from("tasks")
      .select("*")
      .eq("organization_id", orgId)
      .eq("project_id", projectId),
    supabase
      .from("project_assets")
      .select("*")
      .eq("organization_id", orgId)
      .eq("project_id", projectId),
    supabase
      .from("assignments")
      .select("*")
      .eq("organization_id", orgId)
      .eq("project_id", projectId),
  ]);

  for (const res of [milestonesRes, assignmentsRes]) {
    if (res.error) throw res.error;
  }

  const tasks: Task[] = tasksRes.error
    ? []
    : (tasksRes.data ?? []).map((row) =>
        mapTask(row as Record<string, unknown>),
      );
  const taskIds = tasks.map((t) => t.id);

  let task_comments: TaskComment[] = [];
  if (taskIds.length > 0) {
    const [taskCommentsRes, taskCommentMentionsRes, taskCommentReactionsRes] =
      await Promise.all([
        supabase
          .from("task_comments")
          .select("*")
          .eq("organization_id", orgId)
          .in("task_id", taskIds),
        supabase
          .from("task_comment_mentions")
          .select("*")
          .eq("organization_id", orgId),
        supabase
          .from("task_comment_reactions")
          .select("*")
          .eq("organization_id", orgId),
      ]);
    const task_commentsRaw: TaskComment[] = taskCommentsRes.error
      ? []
      : (taskCommentsRes.data ?? []).map((row) =>
          mapTaskComment(row as Record<string, unknown>),
        );
    const idSet = new Set(taskIds);
    task_comments = attachCommentExtras(
      task_commentsRaw.filter((c) => idSet.has(c.task_id)),
      taskCommentMentionsRes,
      taskCommentReactionsRes,
    );
  }

  return {
    milestones: (milestonesRes.data ?? []).map((row) =>
      mapMilestone(row as Record<string, unknown>),
    ),
    task_lists: taskListsRes.error
      ? []
      : (taskListsRes.data ?? []).map((row) =>
          mapTaskList(row as Record<string, unknown>),
        ),
    tasks,
    task_comments,
    project_assets: projectAssetsRes.error
      ? []
      : (projectAssetsRes.data ?? []).map((row) =>
          mapProjectAsset(row as Record<string, unknown>),
        ),
    assignments: (assignmentsRes.data ?? []).map((row) =>
      mapAssignment(row as Record<string, unknown>),
    ),
  };
}

/** Schedule viewport: assignments that overlap or may expand into the range. */
export async function loadAssignmentsForRange(
  supabase: SupabaseClient,
  orgId: string,
  rangeStart: string,
  rangeEnd: string,
  projectId?: string | null,
): Promise<Assignment[]> {
  let query = supabase
    .from("assignments")
    .select("*")
    .eq("organization_id", orgId)
    .or(
      [
        `and(recurrence.eq.none,start_date.lte.${rangeEnd},end_date.gte.${rangeStart})`,
        `and(recurrence.eq.weekly,start_date.lte.${rangeEnd},or(recurrence_end_date.is.null,recurrence_end_date.gte.${rangeStart}))`,
        // Legacy / null recurrence treated like none
        `and(recurrence.is.null,start_date.lte.${rangeEnd},end_date.gte.${rangeStart})`,
      ].join(","),
    );
  if (projectId) {
    query = query.eq("project_id", projectId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => mapAssignment(row as Record<string, unknown>));
}

export async function loadLeaveForRange(
  supabase: SupabaseClient,
  orgId: string,
  rangeStart: string,
  rangeEnd: string,
): Promise<LeaveDay[]> {
  const { data, error } = await supabase
    .from("leave_days")
    .select("*")
    .eq("organization_id", orgId)
    .gte("date", rangeStart)
    .lte("date", rangeEnd);
  if (error) throw error;
  return (data ?? []).map((row) => mapLeaveDay(row as Record<string, unknown>));
}

export type ProjectBudgetBurnRow = {
  project_id: string;
  used_hours: number;
  future_hours: number;
  planned_hours: number;
  used_amount: number;
  future_amount: number;
  planned_amount: number;
  total_hours: number;
  total_amount: number | null;
  mode: "none" | "hours" | "amount";
  pct: number;
  over_by: number;
  remaining_hours: number;
  remaining_amount: number | null;
  amount_over_by: number;
};

export type PersonUtilizationWeekRow = {
  person_id: string;
  week_start: string;
  booked_hours: number;
  available_hours: number;
};

export async function rpcProjectBudgetBurns(
  supabase: SupabaseClient,
  asOf?: string,
): Promise<ProjectBudgetBurnRow[]> {
  const { data, error } = await supabase.rpc("rpc_project_budget_burns", {
    p_as_of: asOf ?? undefined,
  });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    project_id: String(row.project_id),
    used_hours: num(row.used_hours),
    future_hours: num(row.future_hours),
    planned_hours: num(row.planned_hours),
    used_amount: num(row.used_amount),
    future_amount: num(row.future_amount),
    planned_amount: num(row.planned_amount),
    total_hours: num(row.total_hours),
    total_amount:
      row.total_amount == null || row.total_amount === ""
        ? null
        : num(row.total_amount),
    mode: String(row.mode ?? "none") as ProjectBudgetBurnRow["mode"],
    pct: num(row.pct),
    over_by: num(row.over_by),
    remaining_hours: num(row.remaining_hours),
    remaining_amount:
      row.remaining_amount == null || row.remaining_amount === ""
        ? null
        : num(row.remaining_amount),
    amount_over_by: num(row.amount_over_by),
  }));
}

export async function rpcPersonUtilizationWeeks(
  supabase: SupabaseClient,
  weekStart: string,
  weeks: number,
  personIds?: string[] | null,
): Promise<PersonUtilizationWeekRow[]> {
  const { data, error } = await supabase.rpc("rpc_person_utilization_weeks", {
    p_week_start: weekStart,
    p_weeks: weeks,
    p_person_ids: personIds?.length ? personIds : null,
  });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    person_id: String(row.person_id),
    week_start: String(row.week_start),
    booked_hours: num(row.booked_hours),
    available_hours: num(row.available_hours),
  }));
}

/** Full org load (public share / recovery). Bootstrap + heavy. */
export async function loadOrgWorkspace(
  supabase: SupabaseClient,
  orgId: string,
  sessionProfileId: string | null,
): Promise<DemoState> {
  const [boot, heavy] = await Promise.all([
    loadOrgBootstrap(supabase, orgId, sessionProfileId),
    loadOrgHeavyData(supabase, orgId),
  ]);
  return {
    ...boot,
    ...heavy,
    sessionProfileId,
  };
}

export async function bootstrapOrganization(
  supabase: SupabaseClient,
  orgName: string,
  fullName: string,
) {
  const { error } = await supabase.rpc("bootstrap_organization", {
    org_name: orgName,
    user_full_name: fullName,
  });
  if (error) throw error;
}

export async function updateOrganizationNameRow(
  supabase: SupabaseClient,
  orgId: string,
  name: string,
) {
  const { error } = await supabase
    .from("organizations")
    .update({ name })
    .eq("id", orgId);
  if (error) throw error;
}

export async function updateOrganizationSlugRow(
  supabase: SupabaseClient,
  orgId: string,
  slug: string,
) {
  const { error } = await supabase
    .from("organizations")
    .update({ slug })
    .eq("id", orgId);
  if (error) throw error;
}

export async function updateProfileRoleRow(
  supabase: SupabaseClient,
  profileId: string,
  role: Profile["role"],
) {
  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", profileId);
  if (error) throw error;
}

export async function upsertClientRow(
  supabase: SupabaseClient,
  client: Client,
) {
  const base = {
    id: client.id,
    organization_id: client.organization_id,
    name: client.name,
    notes: client.notes,
    color: client.color,
  };
  const withSlug = { ...base, slug: client.slug };
  const withStatus = { ...withSlug, status: client.status ?? "active" };
  const withHide = {
    ...withStatus,
    hide_from_public_share: Boolean(client.hide_from_public_share),
  };
  const withContact = {
    ...withHide,
    contact_first_name: client.contact_first_name ?? "",
    contact_last_name: client.contact_last_name ?? "",
    contact_email: client.contact_email ?? "",
    contact_phone: client.contact_phone ?? "",
    company_website: client.company_website ?? "",
  };

  let { error } = await supabase.from("clients").upsert(withContact);
  if (!error) return;

  const missingContact =
    /Could not find the 'contact_/i.test(error.message) ||
    /Could not find the 'company_website' column/i.test(error.message) ||
    (error.code === "PGRST204" &&
      (/contact_/i.test(error.message) ||
        /company_website/i.test(error.message)));
  const missingHide =
    /Could not find the 'hide_from_public_share' column/i.test(error.message) ||
    (error.code === "PGRST204" && /hide_from_public_share/i.test(error.message));
  const missingSlug =
    /Could not find the 'slug' column/i.test(error.message) ||
    (error.code === "PGRST204" && /slug/i.test(error.message));
  const missingStatus =
    /Could not find the 'status' column/i.test(error.message) ||
    (error.code === "PGRST204" && /status/i.test(error.message));

  if (missingContact) {
    console.warn(
      "clients contact columns missing — apply supabase/migrations/048_client_contact.sql",
    );
    ({ error } = await supabase.from("clients").upsert(withHide));
    if (!error) return;
  }

  if (missingHide) {
    console.warn(
      "clients.hide_from_public_share missing — apply supabase/migrations/043_client_hide_from_public_share.sql",
    );
    ({ error } = await supabase.from("clients").upsert(withStatus));
    if (!error) return;
  }

  if (missingSlug || missingStatus) {
    console.warn(
      missingSlug
        ? "clients.slug missing — apply supabase/migrations/037_slugs.sql"
        : "clients.status missing — apply supabase/migrations/015_pm_execution.sql",
    );
    const payload = missingSlug
      ? missingStatus
        ? base
        : { ...base, status: client.status ?? "active" }
      : withSlug;
    ({ error } = await supabase.from("clients").upsert(payload));
    if (!error) return;
  }
  throw error;
}

export async function deleteClientRow(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) throw error;
}

export async function upsertProjectRow(
  supabase: SupabaseClient,
  project: Project,
) {
  const mode =
    project.budget_mode === "none" ||
    project.budget_mode === "hours" ||
    project.budget_mode === "amount"
      ? project.budget_mode
      : "hours";

  const payload = {
    id: project.id,
    organization_id: project.organization_id,
    client_id: project.client_id,
    name: project.name,
    slug: project.slug,
    status: project.status,
    priority: project.priority,
    color: project.color,
    start_date: project.start_date,
    end_date: project.end_date,
    budget_hours:
      mode === "hours" ? (project.budget_hours ?? 0) : null,
    budget_amount: mode === "amount" ? project.budget_amount : null,
    budget_mode: mode,
    budget_monthly_reset: mode === "hours" && Boolean(project.budget_monthly_reset),
    notes: project.notes,
    manager_person_id: project.manager_person_id ?? null,
    share_enabled: Boolean(project.share_enabled),
    share_token: project.share_token ?? null,
    hide_from_public_share: Boolean(project.hide_from_public_share),
  };

  const missingMonthly = (message: string, code?: string) =>
    /Could not find the 'budget_monthly_reset' column/i.test(message) ||
    (code === "PGRST204" && /budget_monthly_reset/i.test(message));

  const missingShare = (message: string, code?: string) =>
    /Could not find the 'share_(enabled|token)' column/i.test(message) ||
    (code === "PGRST204" && /share_(enabled|token)/i.test(message));

  const missingHideFromShare = (message: string, code?: string) =>
    /Could not find the 'hide_from_public_share' column/i.test(message) ||
    (code === "PGRST204" && /hide_from_public_share/i.test(message));

  const missingSlug = (message: string, code?: string) =>
    /Could not find the 'slug' column/i.test(message) ||
    (code === "PGRST204" && /slug/i.test(message));

  const missingManager = (message: string, code?: string) =>
    /Could not find the 'manager_person_id' column/i.test(message) ||
    (code === "PGRST204" && /manager_person_id/i.test(message));

  const invalidNoneEnum = (message: string, code?: string) =>
    (code === "22P02" || /invalid input value for enum/i.test(message)) &&
    /budget_mode/i.test(message) &&
    /none/i.test(message);

  const nullHoursNotAllowed = (message: string) =>
    /budget_hours/i.test(message) &&
    (/null value/i.test(message) || /not-null|not null/i.test(message));

  let { error } = await supabase.from("projects").upsert(payload);

  // Retry without hide_from_public_share if migration 042 is not applied yet.
  if (error && missingHideFromShare(error.message, error.code)) {
    const { hide_from_public_share: _h, ...rest } = payload;
    const retry = await supabase.from("projects").upsert(rest);
    if (!retry.error) {
      console.warn(
        "projects.hide_from_public_share missing — apply supabase/migrations/042_project_hide_from_public_share.sql",
      );
      return;
    }
    error = retry.error;
  }

  // Retry without slug if migration 037 is not applied yet.
  if (error && missingSlug(error.message, error.code)) {
    const { slug: _s, ...rest } = payload;
    const retry = await supabase.from("projects").upsert(rest);
    if (!retry.error) {
      console.warn(
        "projects.slug missing — apply supabase/migrations/037_slugs.sql",
      );
      return;
    }
    error = retry.error;
  }

  // Retry without manager_person_id if migration 034 is not applied yet.
  if (error && missingManager(error.message, error.code)) {
    const { manager_person_id: _m, ...rest } = payload;
    const retry = await supabase.from("projects").upsert(rest);
    if (!retry.error) {
      console.warn(
        "projects.manager_person_id missing — apply supabase/migrations/034_project_manager.sql",
      );
      return;
    }
    error = retry.error;
  }

  // Retry without share_enabled/share_token if migration 015 is not applied yet.
  if (error && missingShare(error.message, error.code)) {
    const { share_enabled: _se, share_token: _st, ...rest } = payload;
    const retry = await supabase.from("projects").upsert(rest);
    if (!retry.error) {
      console.warn(
        "projects.share_enabled/share_token missing — apply supabase/migrations/015_pm_execution.sql",
      );
      return;
    }
    error = retry.error;
  }

  // Retry without budget_monthly_reset if the column is not migrated yet.
  // Never soft-succeed when the user is turning monthly reset ON — that would
  // leave true only in local state and get wiped by a later failed save refresh.
  if (error && missingMonthly(error.message, error.code)) {
    if (payload.budget_monthly_reset) {
      throw new Error(
        "Missing DB column `budget_monthly_reset`. In Supabase SQL Editor run supabase/migrations/010_budget_monthly_reset_fix.sql, then try again.",
      );
    }
    const { budget_monthly_reset: _m, ...rest } = payload;
    const retry = await supabase.from("projects").upsert(rest);
    if (!retry.error) {
      console.warn(
        "projects.budget_monthly_reset missing — apply supabase/migrations/010_budget_monthly_reset_fix.sql",
      );
      return;
    }
    error = retry.error;
  }

  // Pre-migration DBs still have budget_hours NOT NULL — store 0 for none/amount.
  if (error && nullHoursNotAllowed(error.message) && mode !== "hours") {
    const retryPayload = {
      ...payload,
      budget_hours: 0,
    };
    if (!payload.budget_monthly_reset) {
      const { budget_monthly_reset: _m, ...rest } = retryPayload;
      const retry = await supabase.from("projects").upsert(rest);
      if (!retry.error) return;
      error = retry.error;
    } else {
      const retry = await supabase.from("projects").upsert(retryPayload);
      if (!retry.error) return;
      error = retry.error;
    }
  }

  // Combined: strip monthly + zero hours for none/amount on older schemas.
  if (
    error &&
    (missingMonthly(error.message, error.code) ||
      nullHoursNotAllowed(error.message)) &&
    mode !== "hours" &&
    !payload.budget_monthly_reset
  ) {
    const retry = await supabase.from("projects").upsert({
      id: payload.id,
      organization_id: payload.organization_id,
      client_id: payload.client_id,
      name: payload.name,
      status: payload.status,
      priority: payload.priority,
      color: payload.color,
      start_date: payload.start_date,
      end_date: payload.end_date,
      budget_hours: 0,
      budget_amount: payload.budget_amount,
      budget_mode: payload.budget_mode,
      notes: payload.notes,
    });
    if (!retry.error) {
      console.warn(
        "projects budget columns partially migrated — apply supabase/migrations/010_budget_monthly_reset_fix.sql",
      );
      return;
    }
    error = retry.error;
  }

  if (error && invalidNoneEnum(error.message, error.code)) {
    throw new Error(
      'Budget type "None" needs a DB update. In Supabase SQL Editor run supabase/migrations/010_budget_monthly_reset_fix.sql, then try again.',
    );
  }

  if (error) throw error;
}

export async function deleteProjectRow(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}

/** Replace the explicit team roster for a project. */
export async function setProjectMembersRows(
  supabase: SupabaseClient,
  projectId: string,
  organizationId: string,
  personIds: string[],
) {
  const { error: delErr } = await supabase
    .from("project_members")
    .delete()
    .eq("project_id", projectId);
  if (delErr) {
    if (
      /relation .*project_members.* does not exist/i.test(delErr.message) ||
      delErr.code === "42P01"
    ) {
      console.warn(
        "project_members missing — apply supabase/migrations/026_project_members.sql",
      );
      return;
    }
    throw delErr;
  }

  const ids = [...new Set(personIds)];
  if (ids.length === 0) return;
  const { error: insErr } = await supabase.from("project_members").insert(
    ids.map((person_id) => ({
      project_id: projectId,
      person_id,
      organization_id: organizationId,
    })),
  );
  if (insErr) throw insErr;
}

export async function upsertPersonRow(
  supabase: SupabaseClient,
  person: Person,
) {
  const payload = {
    id: person.id,
    organization_id: person.organization_id,
    profile_id: person.profile_id,
    name: person.name,
    email: person.email || null,
    role_title: person.role_title,
    department: person.department,
    office: person.office,
    capacity_hours_week: person.capacity_hours_week,
    cost_rate: person.cost_rate,
    bill_rate: person.bill_rate,
    timezone: person.timezone,
    holiday_calendar_id: person.holiday_calendar_id,
    avatar_url: person.avatar_url,
  };
  const { error } = await supabase.from("people").upsert(payload);
  if (!error) return;

  const missingEmailCol =
    /Could not find the 'email' column/i.test(error.message) ||
    (error.code === "PGRST204" && /email/i.test(error.message));
  const missingCalCol =
    /Could not find the 'holiday_calendar_id' column/i.test(error.message) ||
    (error.code === "PGRST204" && /holiday_calendar_id/i.test(error.message));
  const missingAvatarCol =
    /Could not find the 'avatar_url' column/i.test(error.message) ||
    (error.code === "PGRST204" && /avatar_url/i.test(error.message));

  if (missingEmailCol || missingCalCol || missingAvatarCol) {
    const { email: _e, holiday_calendar_id: _c, avatar_url: _a, ...rest } =
      payload;
    const retryPayload = {
      ...rest,
      ...(missingEmailCol ? {} : { email: payload.email }),
      ...(missingCalCol
        ? {}
        : { holiday_calendar_id: payload.holiday_calendar_id }),
      ...(missingAvatarCol ? {} : { avatar_url: payload.avatar_url }),
    };
    const retry = await supabase.from("people").upsert(retryPayload);
    if (retry.error) throw retry.error;
    if (missingCalCol) {
      console.warn(
        "people.holiday_calendar_id missing — apply supabase/migrations/008_holiday_calendars.sql",
      );
    }
    if (missingEmailCol) {
      console.warn(
        "people.email column missing — ran upsert without it. Apply supabase/migrations/004_people_email.sql",
      );
    }
    if (missingAvatarCol) {
      console.warn(
        "people.avatar_url missing — apply supabase/migrations/019_people_avatar_url.sql",
      );
    }
    return;
  }

  throw error;
}

export async function deletePersonRow(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("people").delete().eq("id", id);
  if (error) throw error;
}

/** Avatar-only update — members can use this via people_update_self RLS. */
export async function updatePersonAvatarRow(
  supabase: SupabaseClient,
  personId: string,
  avatarUrl: string | null,
) {
  const { error } = await supabase
    .from("people")
    .update({ avatar_url: avatarUrl })
    .eq("id", personId);
  if (error) throw error;
}

export async function upsertAssignmentRow(
  supabase: SupabaseClient,
  assignment: Assignment,
) {
  const { error } = await supabase.from("assignments").upsert({
    id: assignment.id,
    organization_id: assignment.organization_id,
    person_id: assignment.person_id,
    project_id: assignment.project_id,
    start_date: assignment.start_date,
    end_date: assignment.end_date,
    hours_per_day: assignment.hours_per_day,
    allocation_pct: assignment.allocation_pct,
    status: assignment.status,
    notes: assignment.notes,
    recurrence: assignment.recurrence ?? "none",
    recurrence_end_date: assignment.recurrence_end_date,
    recurrence_exceptions: assignment.recurrence_exceptions ?? [],
  });
  if (error) throw error;
}

export async function deleteAssignmentRow(
  supabase: SupabaseClient,
  id: string,
) {
  const { error } = await supabase.from("assignments").delete().eq("id", id);
  if (error) throw error;
}

export async function upsertMilestoneRow(
  supabase: SupabaseClient,
  milestone: Milestone,
) {
  const payload = {
    id: milestone.id,
    organization_id: milestone.organization_id,
    project_id: milestone.project_id,
    name: milestone.name,
    start_date: milestone.start_date,
    due_date: milestone.due_date,
    status: milestone.status,
    client_approved: Boolean(milestone.client_approved),
    sort_order: milestone.sort_order,
  };
  const { error } = await supabase.from("milestones").upsert(payload);
  if (!error) return;

  const missingApproved =
    /Could not find the 'client_approved' column/i.test(error.message) ||
    (error.code === "PGRST204" && /client_approved/i.test(error.message));
  const missingSort =
    /Could not find the 'sort_order' column/i.test(error.message) ||
    (error.code === "PGRST204" && /sort_order/i.test(error.message));
  const missingStart =
    /Could not find the 'start_date' column/i.test(error.message) ||
    (error.code === "PGRST204" && /start_date/i.test(error.message));

  if (missingApproved || missingSort || missingStart) {
    const rest = { ...payload };
    if (missingApproved) delete (rest as { client_approved?: boolean }).client_approved;
    if (missingSort) delete (rest as { sort_order?: number }).sort_order;
    if (missingStart) delete (rest as { start_date?: string | null }).start_date;
    const retry = await supabase.from("milestones").upsert(rest);
    if (!retry.error) {
      if (missingApproved) {
        console.warn(
          "milestones.client_approved missing — apply supabase/migrations/015_pm_execution.sql",
        );
      }
      if (missingSort) {
        console.warn(
          "milestones.sort_order missing — apply supabase/migrations/018_milestone_sort_order.sql",
        );
      }
      if (missingStart) {
        console.warn(
          "milestones.start_date missing — apply supabase/migrations/025_assets_milestones_mentions.sql",
        );
      }
      return;
    }
    throw retry.error;
  }
  throw error;
}

export async function deleteMilestoneRow(
  supabase: SupabaseClient,
  id: string,
) {
  const { error } = await supabase.from("milestones").delete().eq("id", id);
  if (error) throw error;
}

export async function upsertLeaveRow(
  supabase: SupabaseClient,
  leave: LeaveDay,
) {
  const payload = {
    id: leave.id,
    organization_id: leave.organization_id,
    person_id: leave.person_id,
    date: leave.date,
    kind: leave.kind,
    status: leave.status,
    hours_per_day: leave.hours_per_day,
    notes: leave.notes ?? "",
  };
  const { error } = await supabase.from("leave_days").upsert(payload);
  if (!error) return;

  const missingCols =
    /Could not find the '(hours_per_day|notes)' column/i.test(error.message) ||
    (error.code === "PGRST204" &&
      /(hours_per_day|notes)/i.test(error.message));
  if (missingCols) {
    const { hours_per_day: _h, notes: _n, ...rest } = payload;
    const retry = await supabase.from("leave_days").upsert(rest);
    if (retry.error) throw retry.error;
    console.warn(
      "leave_days.hours_per_day/notes missing — apply supabase/migrations/012_leave_hours_notes.sql",
    );
    return;
  }
  throw error;
}

export async function deleteLeaveRow(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("leave_days").delete().eq("id", id);
  if (error) throw error;
}

export async function upsertHolidayCalendarRow(
  supabase: SupabaseClient,
  calendar: HolidayCalendar,
) {
  const { error } = await supabase.from("holiday_calendars").upsert({
    id: calendar.id,
    organization_id: calendar.organization_id,
    name: calendar.name,
    region: calendar.region,
  });
  if (error) throw error;
}

export async function deleteHolidayCalendarRow(
  supabase: SupabaseClient,
  id: string,
) {
  const { error } = await supabase.from("holiday_calendars").delete().eq("id", id);
  if (error) throw error;
}

export async function upsertHolidayCalendarDayRow(
  supabase: SupabaseClient,
  day: HolidayCalendarDay,
) {
  const { error } = await supabase.from("holiday_calendar_days").upsert({
    id: day.id,
    organization_id: day.organization_id,
    calendar_id: day.calendar_id,
    date: day.date,
    name: day.name,
  });
  if (error) throw error;
}

export async function deleteHolidayCalendarDayRow(
  supabase: SupabaseClient,
  id: string,
) {
  const { error } = await supabase
    .from("holiday_calendar_days")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

/** Upsert statutory leave days for people assigned to a calendar. */
export async function applyHolidayCalendarLeave(
  supabase: SupabaseClient,
  args: {
    organizationId: string;
    calendarId: string;
    personIds: string[];
    days: { date: string; name: string }[];
    newLeaveId: () => string;
  },
): Promise<LeaveDay[]> {
  const rows: LeaveDay[] = [];
  for (const personId of args.personIds) {
    for (const day of args.days) {
      rows.push({
        id: args.newLeaveId(),
        organization_id: args.organizationId,
        person_id: personId,
        date: day.date,
        kind: "holiday",
        status: "approved",
        hours_per_day: null,
        notes: day.name || "",
      });
    }
  }
  if (rows.length === 0) return [];

  // Upsert by (person_id, date) — fetch existing then merge ids.
  const { data: existing, error: existingError } = await supabase
    .from("leave_days")
    .select("id, person_id, date")
    .eq("organization_id", args.organizationId)
    .in("person_id", args.personIds);
  if (existingError) throw existingError;

  const byKey = new Map(
    (existing ?? []).map((r) => [`${r.person_id}|${r.date}`, String(r.id)]),
  );
  const payload = rows.map((r) => {
    const key = `${r.person_id}|${r.date}`;
    const id = byKey.get(key) ?? r.id;
    return {
      id,
      organization_id: r.organization_id,
      person_id: r.person_id,
      date: r.date,
      kind: "holiday" as const,
      status: "approved" as const,
      hours_per_day: r.hours_per_day,
      notes: r.notes,
    };
  });

  const { error } = await supabase.from("leave_days").upsert(payload);
  if (error) throw error;
  return payload.map((p) => ({
    id: p.id,
    organization_id: p.organization_id,
    person_id: p.person_id,
    date: p.date,
    kind: p.kind,
    status: p.status,
    hours_per_day: p.hours_per_day,
    notes: p.notes,
  }));
}

export async function upsertProjectAssetRow(
  supabase: SupabaseClient,
  asset: ProjectAsset,
) {
  const { error } = await supabase.from("project_assets").upsert({
    id: asset.id,
    organization_id: asset.organization_id,
    project_id: asset.project_id,
    kind: asset.kind,
    label: asset.label,
    url: asset.url,
    body: asset.body,
    sort_order: asset.sort_order,
    hide_from_client: Boolean(asset.hide_from_client),
  });
  if (!error) return;

  const missingHide =
    /Could not find the 'hide_from_client' column/i.test(error.message) ||
    (error.code === "PGRST204" && /hide_from_client/i.test(error.message));
  if (missingHide) {
    const { hide_from_client: _, ...rest } = {
      id: asset.id,
      organization_id: asset.organization_id,
      project_id: asset.project_id,
      kind: asset.kind,
      label: asset.label,
      url: asset.url,
      body: asset.body,
      sort_order: asset.sort_order,
      hide_from_client: Boolean(asset.hide_from_client),
    };
    void _;
    const retry = await supabase.from("project_assets").upsert(rest);
    if (!retry.error) {
      console.warn(
        "project_assets.hide_from_client missing — apply supabase/migrations/025_assets_milestones_mentions.sql",
      );
      return;
    }
    throw retry.error;
  }
  throw error;
}

export async function deleteProjectAssetRow(
  supabase: SupabaseClient,
  id: string,
) {
  const { error } = await supabase.from("project_assets").delete().eq("id", id);
  if (error) throw error;
}

export async function upsertTaskListRow(
  supabase: SupabaseClient,
  list: TaskList,
) {
  const payload = {
    id: list.id,
    organization_id: list.organization_id,
    project_id: list.project_id,
    milestone_id: list.milestone_id,
    name: list.name,
    color: list.color,
    sort_order: list.sort_order,
    archived: list.archived,
  };
  let { error } = await supabase.from("task_lists").upsert(payload);
  if (error && /archived/i.test(error.message)) {
    const { archived: _drop, ...legacy } = payload;
    ({ error } = await supabase.from("task_lists").upsert(legacy));
    if (!error) {
      console.warn(
        "task_lists.archived missing — apply supabase/migrations/040_task_list_archived.sql",
      );
    }
  }
  if (error) throw error;
}

export async function deleteTaskListRow(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("task_lists").delete().eq("id", id);
  if (error) throw error;
}

export async function upsertTaskRow(supabase: SupabaseClient, task: Task) {
  // Prefer UPDATE first: members only have UPDATE RLS (assigned tasks), and
  // PostgREST upsert requires INSERT which members lack — that caused status
  // to flip locally then bounce back after refreshSupabase on error.
  const payload = {
    id: task.id,
    organization_id: task.organization_id,
    project_id: task.project_id,
    list_id: task.list_id,
    parent_id: task.parent_id,
    assignee_person_id: task.assignee_person_id,
    title: task.title,
    status: task.status,
    start_date: task.start_date,
    due_date: task.due_date,
    notes: task.notes,
    sort_order: task.sort_order,
  };
  const { data, error: updateError } = await supabase
    .from("tasks")
    .update(payload)
    .eq("id", task.id)
    .select("id");
  if (updateError) throw updateError;
  if (data && data.length > 0) return;

  const { error } = await supabase.from("tasks").insert(payload);
  if (error) throw error;
}

export async function deleteTaskRow(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}

export async function upsertTaskCommentRow(
  supabase: SupabaseClient,
  comment: TaskComment,
) {
  const payload = {
    id: comment.id,
    organization_id: comment.organization_id,
    task_id: comment.task_id,
    author_profile_id: comment.author_profile_id,
    body: comment.body,
    created_at: comment.created_at,
    updated_at: comment.updated_at,
  };
  let { error } = await supabase.from("task_comments").upsert(payload);
  if (error && /updated_at/i.test(error.message)) {
    const { updated_at: _drop, ...legacy } = payload;
    ({ error } = await supabase.from("task_comments").upsert(legacy));
    if (!error) {
      console.warn(
        "task_comments.updated_at missing — apply supabase/migrations/029_task_comment_update.sql",
      );
    }
  }
  if (error) throw error;

  const { error: delErr } = await supabase
    .from("task_comment_mentions")
    .delete()
    .eq("comment_id", comment.id);
  if (delErr) {
    if (
      /relation .*task_comment_mentions.* does not exist/i.test(delErr.message) ||
      delErr.code === "42P01"
    ) {
      console.warn(
        "task_comment_mentions missing — apply supabase/migrations/025_assets_milestones_mentions.sql",
      );
      return;
    }
    throw delErr;
  }

  const ids = [...new Set(comment.mentioned_person_ids ?? [])];
  if (ids.length === 0) {
    await supabase
      .from("mention_unreads")
      .delete()
      .eq("comment_id", comment.id);
    return;
  }
  const { error: insErr } = await supabase.from("task_comment_mentions").insert(
    ids.map((person_id) => ({
      comment_id: comment.id,
      person_id,
      organization_id: comment.organization_id,
    })),
  );
  if (insErr) throw insErr;

  const existingRes = await supabase
    .from("mention_unreads")
    .select("person_id")
    .eq("comment_id", comment.id);
  if (
    existingRes.error &&
    (/relation .*mention_unreads.* does not exist/i.test(
      existingRes.error.message,
    ) ||
      existingRes.error.code === "42P01")
  ) {
    console.warn(
      "mention_unreads missing — apply supabase/migrations/044_notification_unreads.sql",
    );
    return;
  }
  if (existingRes.error) throw existingRes.error;

  const existing = new Set(
    (existingRes.data ?? []).map((r) => String(r.person_id)),
  );
  const idSet = new Set(ids);
  const toRemove = [...existing].filter((id) => !idSet.has(id));
  const toAdd = ids.filter((id) => !existing.has(id));

  if (toRemove.length > 0) {
    const { error: delUnreadErr } = await supabase
      .from("mention_unreads")
      .delete()
      .eq("comment_id", comment.id)
      .in("person_id", toRemove);
    if (delUnreadErr) throw delUnreadErr;
  }
  if (toAdd.length > 0) {
    const { error: addUnreadErr } = await supabase
      .from("mention_unreads")
      .insert(
        toAdd.map((person_id) => ({
          comment_id: comment.id,
          person_id,
          organization_id: comment.organization_id,
        })),
      );
    if (addUnreadErr) throw addUnreadErr;
  }
}

export async function deleteTaskCommentRow(
  supabase: SupabaseClient,
  id: string,
) {
  const { error } = await supabase.from("task_comments").delete().eq("id", id);
  if (error) throw error;
}

export async function toggleTaskCommentReactionRow(
  supabase: SupabaseClient,
  input: {
    comment_id: string;
    organization_id: string;
    profile_id: string;
    emoji: string;
    active: boolean;
  },
) {
  if (input.active) {
    const { error } = await supabase.from("task_comment_reactions").upsert({
      comment_id: input.comment_id,
      organization_id: input.organization_id,
      profile_id: input.profile_id,
      emoji: input.emoji,
    });
    if (error) {
      if (
        /relation .*task_comment_reactions.* does not exist/i.test(error.message) ||
        error.code === "42P01"
      ) {
        console.warn(
          "task_comment_reactions missing — apply supabase/migrations/036_task_comment_reactions.sql",
        );
        return;
      }
      throw error;
    }
    return;
  }
  const { error } = await supabase
    .from("task_comment_reactions")
    .delete()
    .eq("comment_id", input.comment_id)
    .eq("profile_id", input.profile_id)
    .eq("emoji", input.emoji);
  if (error) {
    if (
      /relation .*task_comment_reactions.* does not exist/i.test(error.message) ||
      error.code === "42P01"
    ) {
      console.warn(
        "task_comment_reactions missing — apply supabase/migrations/036_task_comment_reactions.sql",
      );
      return;
    }
    throw error;
  }
}

export async function upsertBulletinRow(
  supabase: SupabaseClient,
  bulletin: Bulletin,
) {
  const payload = {
    id: bulletin.id,
    organization_id: bulletin.organization_id,
    project_id: bulletin.project_id,
    title: bulletin.title,
    body: bulletin.body,
    pinned: bulletin.pinned,
    audience: bulletin.audience,
    audience_person_ids: bulletin.audience_person_ids,
    created_by_profile_id: bulletin.created_by_profile_id,
    created_at: bulletin.created_at,
  };
  const { error } = await supabase.from("bulletins").upsert(payload);
  if (!error) return;

  const missingAudience =
    /Could not find the 'audience'/i.test(error.message) ||
    /audience_person_ids/i.test(error.message) ||
    (error.code === "PGRST204" && /audience/i.test(error.message));
  if (missingAudience) {
    const {
      audience: _a,
      audience_person_ids: _ids,
      ...rest
    } = payload;
    const retry = await supabase.from("bulletins").upsert(rest);
    if (retry.error) throw retry.error;
    console.warn(
      "bulletins.audience missing — apply supabase/migrations/020_bulletin_audience.sql",
    );
    return;
  }

  throw error;
}

export async function deleteBulletinRow(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("bulletins").delete().eq("id", id);
  if (error) throw error;
}

/** Seed unread inbox rows for bulletin recipients (create only). */
export async function seedBulletinUnreadRows(
  supabase: SupabaseClient,
  rows: {
    bulletin_id: string;
    profile_id: string;
    organization_id: string;
  }[],
): Promise<boolean> {
  if (rows.length === 0) return true;
  const { error } = await supabase.from("bulletin_unreads").upsert(rows, {
    onConflict: "bulletin_id,profile_id",
    ignoreDuplicates: true,
  });
  if (!error) return true;
  if (
    /relation .*bulletin_unreads.* does not exist/i.test(error.message) ||
    error.code === "42P01"
  ) {
    console.warn(
      "bulletin_unreads missing — apply supabase/migrations/044_notification_unreads.sql",
    );
    return false;
  }
  throw error;
}

/** Dismiss = delete from unread inbox. */
export async function deleteBulletinUnreadRow(
  supabase: SupabaseClient,
  row: {
    bulletin_id: string;
    profile_id: string;
  },
): Promise<boolean> {
  const { error } = await supabase
    .from("bulletin_unreads")
    .delete()
    .eq("bulletin_id", row.bulletin_id)
    .eq("profile_id", row.profile_id);
  if (!error) return true;
  if (
    /relation .*bulletin_unreads.* does not exist/i.test(error.message) ||
    error.code === "42P01"
  ) {
    console.warn(
      "bulletin_unreads missing — apply supabase/migrations/044_notification_unreads.sql",
    );
    return false;
  }
  throw error;
}

/** Dismiss a tagged-comment notice for a person. */
export async function deleteMentionUnreadRow(
  supabase: SupabaseClient,
  row: {
    comment_id: string;
    person_id: string;
  },
): Promise<boolean> {
  const { error } = await supabase
    .from("mention_unreads")
    .delete()
    .eq("comment_id", row.comment_id)
    .eq("person_id", row.person_id);
  if (!error) return true;
  if (
    /relation .*mention_unreads.* does not exist/i.test(error.message) ||
    error.code === "42P01"
  ) {
    console.warn(
      "mention_unreads missing — apply supabase/migrations/044_notification_unreads.sql",
    );
    return false;
  }
  throw error;
}

/** One-time: drop mention unreads that were dismissed in legacy localStorage. */
export async function deleteMentionUnreadRows(
  supabase: SupabaseClient,
  personId: string,
  commentIds: string[],
): Promise<boolean> {
  if (commentIds.length === 0) return true;
  const { error } = await supabase
    .from("mention_unreads")
    .delete()
    .eq("person_id", personId)
    .in("comment_id", commentIds);
  if (!error) return true;
  if (
    /relation .*mention_unreads.* does not exist/i.test(error.message) ||
    error.code === "42P01"
  ) {
    return false;
  }
  throw error;
}

export async function upsertProjectTemplateRow(
  supabase: SupabaseClient,
  template: ProjectTemplate,
) {
  const { error } = await supabase.from("project_templates").upsert({
    id: template.id,
    organization_id: template.organization_id,
    name: template.name,
    description: template.description,
  });
  if (error) throw error;
}

export async function deleteProjectTemplateRow(
  supabase: SupabaseClient,
  id: string,
) {
  const { error } = await supabase
    .from("project_templates")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function upsertTemplateMilestoneRow(
  supabase: SupabaseClient,
  milestone: TemplateMilestone,
) {
  const { error } = await supabase.from("template_milestones").upsert({
    id: milestone.id,
    organization_id: milestone.organization_id,
    template_id: milestone.template_id,
    name: milestone.name,
    offset_days: milestone.offset_days,
    sort_order: milestone.sort_order,
  });
  if (error) throw error;
}

export async function deleteTemplateMilestoneRow(
  supabase: SupabaseClient,
  id: string,
) {
  const { error } = await supabase
    .from("template_milestones")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function upsertTemplateTaskListRow(
  supabase: SupabaseClient,
  list: TemplateTaskList,
) {
  const { error } = await supabase.from("template_task_lists").upsert({
    id: list.id,
    organization_id: list.organization_id,
    template_id: list.template_id,
    template_milestone_id: list.template_milestone_id,
    name: list.name,
    sort_order: list.sort_order,
  });
  if (error) throw error;
}

export async function deleteTemplateTaskListRow(
  supabase: SupabaseClient,
  id: string,
) {
  const { error } = await supabase
    .from("template_task_lists")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function upsertTemplateTaskRow(
  supabase: SupabaseClient,
  task: TemplateTask,
) {
  const { error } = await supabase.from("template_tasks").upsert({
    id: task.id,
    organization_id: task.organization_id,
    template_id: task.template_id,
    list_id: task.list_id,
    parent_id: task.parent_id,
    title: task.title,
    notes: task.notes,
    offset_days: task.offset_days,
    sort_order: task.sort_order,
  });
  if (error) throw error;
}

export async function deleteTemplateTaskRow(
  supabase: SupabaseClient,
  id: string,
) {
  const { error } = await supabase
    .from("template_tasks")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

/**
 * Apply a project template: create undated milestones/task lists/tasks on a project.
 * Dates stay null so the user sets the schedule after initialization.
 */
export async function applyProjectTemplateRows(
  supabase: SupabaseClient,
  args: {
    organizationId: string;
    projectId: string;
    milestones: {
      id: string;
      name: string;
      due_date: string | null;
      start_date: string | null;
      status: "upcoming";
      sort_order: number;
    }[];
    taskLists: {
      id: string;
      milestone_id: string | null;
      name: string;
      color: string | null;
      sort_order: number;
    }[];
    tasks: {
      id: string;
      list_id: string;
      parent_id: string | null;
      title: string;
      notes: string;
      due_date: string | null;
      sort_order: number;
    }[];
  },
) {
  const milestoneRows = args.milestones.map((m) => ({
    id: m.id,
    organization_id: args.organizationId,
    project_id: args.projectId,
    name: m.name,
    start_date: m.start_date,
    due_date: m.due_date,
    status: m.status,
    client_approved: false,
    sort_order: m.sort_order,
  }));
  const taskListRows = args.taskLists.map((l) => ({
    id: l.id,
    organization_id: args.organizationId,
    project_id: args.projectId,
    milestone_id: l.milestone_id,
    name: l.name,
    color: l.color ?? null,
    sort_order: l.sort_order,
    archived: false,
  }));
  const taskRows = orderTasksParentsFirst(
    args.tasks.map((t) => ({
      id: t.id,
      organization_id: args.organizationId,
      project_id: args.projectId,
      list_id: t.list_id,
      parent_id: t.parent_id,
      assignee_person_id: null as string | null,
      title: t.title,
      status: "upcoming" as const,
      start_date: null as string | null,
      due_date: t.due_date,
      notes: t.notes,
      sort_order: t.sort_order,
    })),
  );

  if (milestoneRows.length > 0) {
    const { error } = await supabase.from("milestones").insert(milestoneRows);
    if (error) throw error;
  }
  if (taskListRows.length > 0) {
    const { error } = await supabase.from("task_lists").insert(taskListRows);
    if (error) throw error;
  }
  if (taskRows.length > 0) {
    const { error } = await supabase.from("tasks").insert(taskRows);
    if (error) throw error;
  }
}

function remapId(cache: Map<string, string>, oldId: string): string {
  if (!cache.has(oldId)) cache.set(oldId, crypto.randomUUID());
  return cache.get(oldId)!;
}

/** Wipe org planning data and insert the narrative demo seed with fresh UUIDs. */
export async function seedDemoWorkspace(
  supabase: SupabaseClient,
  organizationId: string,
) {
  const { error: clearError } = await supabase.rpc("clear_organization_data");
  if (clearError) throw clearError;

  const seed = createDemoSeed();
  const ids = new Map<string, string>();

  const clients = seed.clients.map((c) => ({
    id: remapId(ids, c.id),
    organization_id: organizationId,
    name: c.name,
    notes: c.notes,
    color: c.color,
    status: c.status,
    hide_from_public_share: Boolean(c.hide_from_public_share),
    contact_first_name: c.contact_first_name ?? "",
    contact_last_name: c.contact_last_name ?? "",
    contact_email: c.contact_email ?? "",
    contact_phone: c.contact_phone ?? "",
    company_website: c.company_website ?? "",
  }));

  const projects = seed.projects.map((p) => ({
    id: remapId(ids, p.id),
    organization_id: organizationId,
    client_id: p.client_id ? remapId(ids, p.client_id) : null,
    name: p.name,
    status: p.status,
    priority: p.priority,
    color: p.color,
    start_date: p.start_date,
    end_date: p.end_date,
    budget_hours: p.budget_hours,
    budget_amount: p.budget_amount,
    budget_mode: p.budget_mode,
    budget_monthly_reset: p.budget_monthly_reset,
    notes: p.notes,
    manager_person_id: p.manager_person_id
      ? remapId(ids, p.manager_person_id)
      : null,
    share_enabled: false,
    share_token: null as string | null,
    hide_from_public_share: Boolean(p.hide_from_public_share),
  }));

  const people = seed.people.map((p) => ({
    id: remapId(ids, p.id),
    organization_id: organizationId,
    profile_id: null as string | null,
    name: p.name,
    email: p.email || null,
    role_title: p.role_title,
    department: p.department,
    office: p.office,
    capacity_hours_week: p.capacity_hours_week,
    cost_rate: p.cost_rate,
    bill_rate: p.bill_rate,
    timezone: p.timezone,
    holiday_calendar_id: p.holiday_calendar_id
      ? remapId(ids, p.holiday_calendar_id)
      : null,
    avatar_url: p.avatar_url,
  }));

  const calendars = seed.holiday_calendars.map((c) => ({
    id: remapId(ids, c.id),
    organization_id: organizationId,
    name: c.name,
    region: c.region,
  }));

  const calendarDays = seed.holiday_calendar_days.map((d) => ({
    id: remapId(ids, d.id),
    organization_id: organizationId,
    calendar_id: remapId(ids, d.calendar_id),
    date: d.date,
    name: d.name,
  }));

  const milestones = seed.milestones.map((m) => ({
    id: remapId(ids, m.id),
    organization_id: organizationId,
    project_id: remapId(ids, m.project_id),
    name: m.name,
    due_date: m.due_date,
    status: m.status,
    client_approved: m.client_approved,
    sort_order: m.sort_order,
  }));

  const projectAssets = seed.project_assets.map((a) => ({
    id: remapId(ids, a.id),
    organization_id: organizationId,
    project_id: remapId(ids, a.project_id),
    kind: a.kind,
    label: a.label,
    url: a.url,
    body: a.body,
    sort_order: a.sort_order,
  }));

  const taskLists = seed.task_lists.map((l) => ({
    id: remapId(ids, l.id),
    organization_id: organizationId,
    project_id: remapId(ids, l.project_id),
    milestone_id: l.milestone_id ? remapId(ids, l.milestone_id) : null,
    name: l.name,
    color: l.color,
    sort_order: l.sort_order,
    archived: Boolean(l.archived),
  }));

  const tasks = seed.tasks.map((t) => ({
    id: remapId(ids, t.id),
    organization_id: organizationId,
    project_id: remapId(ids, t.project_id),
    list_id: remapId(ids, t.list_id),
    parent_id: t.parent_id ? remapId(ids, t.parent_id) : null,
    assignee_person_id: t.assignee_person_id
      ? remapId(ids, t.assignee_person_id)
      : null,
    title: t.title,
    status: t.status,
    start_date: t.start_date,
    due_date: t.due_date,
    notes: t.notes,
    sort_order: t.sort_order,
  }));

  const bulletins = seed.bulletins.map((b) => ({
    id: remapId(ids, b.id),
    organization_id: organizationId,
    project_id: b.project_id ? remapId(ids, b.project_id) : null,
    title: b.title,
    body: b.body,
    pinned: b.pinned,
    audience: b.audience ?? "all",
    audience_person_ids: (b.audience_person_ids ?? []).map((pid) =>
      remapId(ids, pid),
    ),
    // Demo authors are not real profiles in a fresh org — omit attribution.
    created_by_profile_id: null as string | null,
    created_at: b.created_at,
  }));

  const projectTemplates = seed.project_templates.map((t) => ({
    id: remapId(ids, t.id),
    organization_id: organizationId,
    name: t.name,
    description: t.description,
  }));

  const templateMilestones = seed.template_milestones.map((m) => ({
    id: remapId(ids, m.id),
    organization_id: organizationId,
    template_id: remapId(ids, m.template_id),
    name: m.name,
    offset_days: m.offset_days,
    sort_order: m.sort_order,
  }));

  const templateTaskLists = seed.template_task_lists.map((l) => ({
    id: remapId(ids, l.id),
    organization_id: organizationId,
    template_id: remapId(ids, l.template_id),
    template_milestone_id: l.template_milestone_id
      ? remapId(ids, l.template_milestone_id)
      : null,
    name: l.name,
    sort_order: l.sort_order,
  }));

  const templateTasks = seed.template_tasks.map((t) => ({
    id: remapId(ids, t.id),
    organization_id: organizationId,
    template_id: remapId(ids, t.template_id),
    list_id: remapId(ids, t.list_id),
    parent_id: t.parent_id ? remapId(ids, t.parent_id) : null,
    title: t.title,
    notes: t.notes,
    offset_days: t.offset_days,
    sort_order: t.sort_order,
  }));

  const assignments = seed.assignments.map((a) => ({
    id: remapId(ids, a.id),
    organization_id: organizationId,
    person_id: remapId(ids, a.person_id),
    project_id: remapId(ids, a.project_id),
    start_date: a.start_date,
    end_date: a.end_date,
    hours_per_day: a.hours_per_day,
    allocation_pct: a.allocation_pct,
    status: a.status,
    notes: a.notes,
    recurrence: a.recurrence ?? "none",
    recurrence_end_date: a.recurrence_end_date ?? null,
    recurrence_exceptions: a.recurrence_exceptions ?? [],
  }));

  const leaveDays = seed.leave_days.map((l) => ({
    id: remapId(ids, l.id),
    organization_id: organizationId,
    person_id: remapId(ids, l.person_id),
    date: l.date,
    kind: l.kind,
    status: l.status,
    hours_per_day: l.hours_per_day,
    notes: l.notes ?? "",
  }));

  // Calendars first so people FK resolves.
  const calInsert = await supabase.from("holiday_calendars").insert(calendars);
  if (calInsert.error) {
    console.warn(
      "holiday_calendars insert skipped:",
      calInsert.error.message,
      "— apply 008_holiday_calendars.sql",
    );
  } else {
    const daysInsert = await supabase
      .from("holiday_calendar_days")
      .insert(calendarDays);
    if (daysInsert.error) throw daysInsert.error;
  }

  const inserts = [
    supabase.from("clients").insert(clients),
    supabase.from("people").insert(
      calInsert.error
        ? people.map(({ holiday_calendar_id: _h, ...rest }) => rest)
        : people,
    ),
  ];
  for (const req of inserts) {
    const { error } = await req;
    if (error) throw error;
  }

  let projectsInsert = await supabase.from("projects").insert(projects);
  if (
    projectsInsert.error &&
    (/manager_person_id/i.test(projectsInsert.error.message) ||
      projectsInsert.error.code === "PGRST204")
  ) {
    const withoutManager = projects.map(
      ({ manager_person_id: _m, ...rest }) => rest,
    );
    projectsInsert = await supabase.from("projects").insert(withoutManager);
    if (!projectsInsert.error) {
      console.warn(
        "projects.manager_person_id missing — apply supabase/migrations/034_project_manager.sql",
      );
    }
  }
  if (projectsInsert.error) throw projectsInsert.error;

  const second = [
    supabase.from("milestones").insert(milestones),
    supabase.from("assignments").insert(assignments),
    supabase.from("leave_days").insert(leaveDays),
  ];
  for (const req of second) {
    const { error } = await req;
    if (error) throw error;
  }

  // PM execution tables are optional until migration 015 is applied.
  const assetsInsert = await supabase
    .from("project_assets")
    .insert(projectAssets);
  const listsInsert = await supabase.from("task_lists").insert(taskLists);
  if (assetsInsert.error || listsInsert.error) {
    console.warn(
      "project_assets/task_lists insert skipped — apply supabase/migrations/015_pm_execution.sql",
    );
  } else {
    const tasksInsert = await supabase.from("tasks").insert(tasks);
    if (tasksInsert.error) throw tasksInsert.error;
  }

  const templatesInsert = await supabase
    .from("project_templates")
    .insert(projectTemplates);
  if (templatesInsert.error) {
    console.warn(
      "project_templates insert skipped — apply supabase/migrations/015_pm_execution.sql",
    );
  } else {
    const tmInsert = await supabase
      .from("template_milestones")
      .insert(templateMilestones);
    const ttlInsert = await supabase
      .from("template_task_lists")
      .insert(templateTaskLists);
    if (tmInsert.error) throw tmInsert.error;
    if (ttlInsert.error) throw ttlInsert.error;
    const ttInsert = await supabase
      .from("template_tasks")
      .insert(templateTasks);
    if (ttInsert.error) throw ttInsert.error;
  }

  const bulletinsInsert = await supabase.from("bulletins").insert(bulletins);
  if (bulletinsInsert.error) {
    console.warn(
      "bulletins insert skipped — apply supabase/migrations/015_pm_execution.sql",
    );
  }
}
