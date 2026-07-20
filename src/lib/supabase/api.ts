import type { SupabaseClient } from "@supabase/supabase-js";
import { createDemoSeed } from "@/lib/demo/seed";
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
    share_enabled: Boolean(row.share_enabled),
    share_token: row.share_token ? String(row.share_token) : null,
  };
}

function mapClient(row: Record<string, unknown>): Client {
  const status = row.status === "archived" ? "archived" : "active";
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    name: String(row.name ?? ""),
    notes: String(row.notes ?? ""),
    color: String(row.color ?? "#64748B"),
    status,
  };
}

function mapMilestone(row: Record<string, unknown>): Milestone {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    project_id: String(row.project_id),
    name: String(row.name ?? ""),
    due_date: String(row.due_date),
    status: row.status as Milestone["status"],
    client_approved: Boolean(row.client_approved),
  };
}

function mapProjectAsset(row: Record<string, unknown>): ProjectAsset {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    project_id: String(row.project_id),
    kind: (row.kind as ProjectAsset["kind"]) ?? "custom",
    label: String(row.label ?? ""),
    url: String(row.url ?? ""),
    sort_order: num(row.sort_order),
  };
}

function mapTaskList(row: Record<string, unknown>): TaskList {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    project_id: String(row.project_id),
    milestone_id: row.milestone_id ? String(row.milestone_id) : null,
    name: String(row.name ?? ""),
    sort_order: num(row.sort_order),
  };
}

function mapTask(row: Record<string, unknown>): Task {
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

function mapTaskComment(row: Record<string, unknown>): TaskComment {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    task_id: String(row.task_id),
    author_profile_id: String(row.author_profile_id),
    body: String(row.body ?? ""),
    created_at: String(row.created_at ?? ""),
  };
}

function mapBulletin(row: Record<string, unknown>): Bulletin {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    project_id: row.project_id ? String(row.project_id) : null,
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    pinned: Boolean(row.pinned),
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
  };
}

function mapAssignment(row: Record<string, unknown>): Assignment {
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
  };
}

function emptyWorkspace(): DemoState {
  return {
    organization: { id: "", name: "" },
    profiles: [],
    clients: [],
    projects: [],
    milestones: [],
    people: [],
    assignments: [],
    leave_days: [],
    holiday_calendars: [],
    holiday_calendar_days: [],
    project_assets: [],
    task_lists: [],
    tasks: [],
    task_comments: [],
    bulletins: [],
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
  return loadOrgWorkspace(supabase, orgId, userId);
}

/** Load org planning data by id (service role for public share). */
export async function loadOrgWorkspace(
  supabase: SupabaseClient,
  orgId: string,
  sessionProfileId: string | null,
): Promise<DemoState> {
  const [
    orgRes,
    profilesRes,
    clientsRes,
    projectsRes,
    milestonesRes,
    peopleRes,
    assignmentsRes,
    leaveRes,
    calendarsRes,
    calendarDaysRes,
    projectAssetsRes,
    taskListsRes,
    tasksRes,
    taskCommentsRes,
    bulletinsRes,
    projectTemplatesRes,
    templateMilestonesRes,
    templateTaskListsRes,
    templateTasksRes,
  ] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", orgId).single(),
    supabase.from("profiles").select("*").eq("organization_id", orgId),
    supabase.from("clients").select("*").eq("organization_id", orgId),
    supabase.from("projects").select("*").eq("organization_id", orgId),
    supabase.from("milestones").select("*").eq("organization_id", orgId),
    supabase.from("people").select("*").eq("organization_id", orgId),
    supabase.from("assignments").select("*").eq("organization_id", orgId),
    supabase.from("leave_days").select("*").eq("organization_id", orgId),
    supabase.from("holiday_calendars").select("*").eq("organization_id", orgId),
    supabase
      .from("holiday_calendar_days")
      .select("*")
      .eq("organization_id", orgId),
    supabase.from("project_assets").select("*").eq("organization_id", orgId),
    supabase.from("task_lists").select("*").eq("organization_id", orgId),
    supabase.from("tasks").select("*").eq("organization_id", orgId),
    supabase.from("task_comments").select("*").eq("organization_id", orgId),
    supabase.from("bulletins").select("*").eq("organization_id", orgId),
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

  for (const res of [
    orgRes,
    profilesRes,
    clientsRes,
    projectsRes,
    milestonesRes,
    peopleRes,
    assignmentsRes,
    leaveRes,
  ]) {
    if (res.error) throw res.error;
  }

  // Calendars are optional until migration 008 is applied.
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

  // PM execution tables are optional until migration 015 is applied.
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
  const task_comments: TaskComment[] = taskCommentsRes.error
    ? []
    : (taskCommentsRes.data ?? []).map((row) =>
        mapTaskComment(row as Record<string, unknown>),
      );
  const bulletins: Bulletin[] = bulletinsRes.error
    ? []
    : (bulletinsRes.data ?? []).map((row) =>
        mapBulletin(row as Record<string, unknown>),
      );
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
    milestones: (milestonesRes.data ?? []).map((row) =>
      mapMilestone(row as Record<string, unknown>),
    ),
    people: (peopleRes.data ?? []).map((row) =>
      mapPerson(row as Record<string, unknown>),
    ),
    assignments: (assignmentsRes.data ?? []).map((row) =>
      mapAssignment(row as Record<string, unknown>),
    ),
    leave_days: (leaveRes.data ?? []).map((row) => ({
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
    })),
    holiday_calendars,
    holiday_calendar_days,
    project_assets,
    task_lists,
    tasks,
    task_comments,
    bulletins,
    project_templates,
    template_milestones,
    template_task_lists,
    template_tasks,
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

export async function upsertClientRow(
  supabase: SupabaseClient,
  client: Client,
) {
  const payload = {
    id: client.id,
    organization_id: client.organization_id,
    name: client.name,
    notes: client.notes,
    color: client.color,
    status: client.status ?? "active",
  };
  const { error } = await supabase.from("clients").upsert(payload);
  if (!error) return;

  const missingStatus =
    /Could not find the 'status' column/i.test(error.message) ||
    (error.code === "PGRST204" && /status/i.test(error.message));
  if (missingStatus) {
    const { status: _s, ...rest } = payload;
    const retry = await supabase.from("clients").upsert(rest);
    if (!retry.error) {
      console.warn(
        "clients.status missing — apply supabase/migrations/015_pm_execution.sql",
      );
      return;
    }
    throw retry.error;
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
    share_enabled: Boolean(project.share_enabled),
    share_token: project.share_token ?? null,
  };

  const missingMonthly = (message: string, code?: string) =>
    /Could not find the 'budget_monthly_reset' column/i.test(message) ||
    (code === "PGRST204" && /budget_monthly_reset/i.test(message));

  const missingShare = (message: string, code?: string) =>
    /Could not find the 'share_(enabled|token)' column/i.test(message) ||
    (code === "PGRST204" && /share_(enabled|token)/i.test(message));

  const invalidNoneEnum = (message: string, code?: string) =>
    (code === "22P02" || /invalid input value for enum/i.test(message)) &&
    /budget_mode/i.test(message) &&
    /none/i.test(message);

  const nullHoursNotAllowed = (message: string) =>
    /budget_hours/i.test(message) &&
    (/null value/i.test(message) || /not-null|not null/i.test(message));

  let { error } = await supabase.from("projects").upsert(payload);

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
  };
  const { error } = await supabase.from("people").upsert(payload);
  if (!error) return;

  const missingEmailCol =
    /Could not find the 'email' column/i.test(error.message) ||
    (error.code === "PGRST204" && /email/i.test(error.message));
  const missingCalCol =
    /Could not find the 'holiday_calendar_id' column/i.test(error.message) ||
    (error.code === "PGRST204" && /holiday_calendar_id/i.test(error.message));

  if (missingEmailCol || missingCalCol) {
    const { email: _e, holiday_calendar_id: _c, ...rest } = payload;
    const retryPayload = {
      ...rest,
      ...(missingEmailCol ? {} : { email: payload.email }),
      ...(missingCalCol ? {} : { holiday_calendar_id: payload.holiday_calendar_id }),
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
    return;
  }

  throw error;
}

export async function deletePersonRow(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("people").delete().eq("id", id);
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
    due_date: milestone.due_date,
    status: milestone.status,
    client_approved: Boolean(milestone.client_approved),
  };
  const { error } = await supabase.from("milestones").upsert(payload);
  if (!error) return;

  const missingApproved =
    /Could not find the 'client_approved' column/i.test(error.message) ||
    (error.code === "PGRST204" && /client_approved/i.test(error.message));
  if (missingApproved) {
    const { client_approved: _c, ...rest } = payload;
    const retry = await supabase.from("milestones").upsert(rest);
    if (!retry.error) {
      console.warn(
        "milestones.client_approved missing — apply supabase/migrations/015_pm_execution.sql",
      );
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
    sort_order: asset.sort_order,
  });
  if (error) throw error;
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
  const { error } = await supabase.from("task_lists").upsert({
    id: list.id,
    organization_id: list.organization_id,
    project_id: list.project_id,
    milestone_id: list.milestone_id,
    name: list.name,
    sort_order: list.sort_order,
  });
  if (error) throw error;
}

export async function deleteTaskListRow(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("task_lists").delete().eq("id", id);
  if (error) throw error;
}

export async function upsertTaskRow(supabase: SupabaseClient, task: Task) {
  const { error } = await supabase.from("tasks").upsert({
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
  });
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
  const { error } = await supabase.from("task_comments").upsert({
    id: comment.id,
    organization_id: comment.organization_id,
    task_id: comment.task_id,
    author_profile_id: comment.author_profile_id,
    body: comment.body,
    created_at: comment.created_at,
  });
  if (error) throw error;
}

export async function deleteTaskCommentRow(
  supabase: SupabaseClient,
  id: string,
) {
  const { error } = await supabase.from("task_comments").delete().eq("id", id);
  if (error) throw error;
}

export async function upsertBulletinRow(
  supabase: SupabaseClient,
  bulletin: Bulletin,
) {
  const { error } = await supabase.from("bulletins").upsert({
    id: bulletin.id,
    organization_id: bulletin.organization_id,
    project_id: bulletin.project_id,
    title: bulletin.title,
    body: bulletin.body,
    pinned: bulletin.pinned,
    created_by_profile_id: bulletin.created_by_profile_id,
    created_at: bulletin.created_at,
  });
  if (error) throw error;
}

export async function deleteBulletinRow(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("bulletins").delete().eq("id", id);
  if (error) throw error;
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
 * Apply a project template: create milestones/task lists/tasks on a project
 * from a template's children, offsetting dates from `startDate`.
 */
export async function applyProjectTemplateRows(
  supabase: SupabaseClient,
  args: {
    organizationId: string;
    projectId: string;
    startDate: string;
    milestones: { id: string; name: string; due_date: string; status: "upcoming" }[];
    taskLists: { id: string; milestone_id: string | null; name: string; sort_order: number }[];
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
    due_date: m.due_date,
    status: m.status,
    client_approved: false,
  }));
  const taskListRows = args.taskLists.map((l) => ({
    id: l.id,
    organization_id: args.organizationId,
    project_id: args.projectId,
    milestone_id: l.milestone_id,
    name: l.name,
    sort_order: l.sort_order,
  }));
  const taskRows = args.tasks.map((t) => ({
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
  }));

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
    share_enabled: false,
    share_token: null as string | null,
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
  }));

  const projectAssets = seed.project_assets.map((a) => ({
    id: remapId(ids, a.id),
    organization_id: organizationId,
    project_id: remapId(ids, a.project_id),
    kind: a.kind,
    label: a.label,
    url: a.url,
    sort_order: a.sort_order,
  }));

  const taskLists = seed.task_lists.map((l) => ({
    id: remapId(ids, l.id),
    organization_id: organizationId,
    project_id: remapId(ids, l.project_id),
    milestone_id: l.milestone_id ? remapId(ids, l.milestone_id) : null,
    name: l.name,
    sort_order: l.sort_order,
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
    supabase.from("projects").insert(projects),
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
