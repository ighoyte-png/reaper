import type {
  Bulletin,
  Person,
  Project,
  Task,
  TaskComment,
  TaskList,
  TaskStatus,
} from "@/lib/types";

/** Default audit fields for newly constructed Task objects (store stamps actor on upsert). */
export function emptyTaskAuditFields(): Pick<
  Task,
  | "created_at"
  | "created_by_profile_id"
  | "edited_at"
  | "edited_by_profile_id"
  | "status_changed_at"
  | "status_changed_by_profile_id"
> {
  return {
    created_at: new Date().toISOString(),
    created_by_profile_id: null,
    edited_at: null,
    edited_by_profile_id: null,
    status_changed_at: null,
    status_changed_by_profile_id: null,
  };
}

export function sortTaskLists(lists: TaskList[]): TaskList[] {
  return [...lists].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

export function tasksForList(tasks: Task[], listId: string): Task[] {
  return tasks
    .filter((t) => t.list_id === listId)
    .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title));
}

export function parentTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => !t.parent_id);
}

export function isTaskDivider(task: Pick<Task, "is_divider">): boolean {
  return Boolean(task.is_divider);
}

/** Label shown centered in a divider row when title is set. */
export function taskDividerLabel(title: string): string | null {
  const trimmed = title.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Divider line/dot color stored in task.notes (hex) when is_divider. */
export function taskDividerColor(
  notes: string | null | undefined,
): string | null {
  const trimmed = (notes ?? "").trim();
  if (!trimmed) return null;
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return trimmed;
  return null;
}

export function normalizeDividerColor(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  if (/^#[0-9A-Fa-f]{6}$/i.test(trimmed)) {
    return `#${trimmed.slice(1).toUpperCase()}`;
  }
  return "";
}

/**
 * Order tasks so parents appear before children (stable within each level).
 * Required for FK-safe inserts into tables with parent_id self-references.
 */
export function orderTasksParentsFirst<
  T extends { id: string; parent_id: string | null; sort_order?: number },
>(tasks: T[]): T[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const children = new Map<string | null, T[]>();
  for (const t of tasks) {
    const parentKey =
      t.parent_id && byId.has(t.parent_id) ? t.parent_id : null;
    const arr = children.get(parentKey) ?? [];
    arr.push(t);
    children.set(parentKey, arr);
  }
  for (const arr of children.values()) {
    arr.sort(
      (a, b) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id.localeCompare(b.id),
    );
  }
  const out: T[] = [];
  function visit(parentId: string | null) {
    for (const t of children.get(parentId) ?? []) {
      out.push(t);
      visit(t.id);
    }
  }
  visit(null);
  // Orphans whose parent was missing from the set but parent_id was set —
  // already treated as roots above. Any leftover (cycles) appended last.
  if (out.length < tasks.length) {
    const seen = new Set(out.map((t) => t.id));
    for (const t of tasks) {
      if (!seen.has(t.id)) out.push(t);
    }
  }
  return out;
}

export function childTasks(tasks: Task[], parentId: string): Task[] {
  return tasks
    .filter((t) => t.parent_id === parentId)
    .sort(compareTaskOrder);
}

export function compareTaskOrder(
  a: Pick<Task, "sort_order" | "title">,
  b: Pick<Task, "sort_order" | "title">,
): number {
  return a.sort_order - b.sort_order || a.title.localeCompare(b.title);
}

export function taskStatusLabel(status: TaskStatus): string {
  switch (status) {
    case "upcoming":
      return "Active";
    case "active":
      return "In Review";
    case "complete":
      return "Complete";
  }
}

export function nextTaskStatus(status: TaskStatus): TaskStatus {
  if (status === "upcoming") return "active";
  if (status === "active") return "complete";
  return "upcoming";
}

export type TaskUrgency =
  | "none"
  | "week"
  | "three_days"
  | "tomorrow"
  | "today"
  | "overdue";

export function taskUrgency(
  dueDate: string | null,
  todayKey: string,
): TaskUrgency {
  if (!dueDate) return "none";
  if (dueDate < todayKey) return "overdue";
  if (dueDate === todayKey) return "today";
  const t = new Date(`${todayKey}T12:00:00`);
  const d = new Date(`${dueDate}T12:00:00`);
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diff === 1) return "tomorrow";
  if (diff <= 3) return "three_days";
  if (diff <= 7) return "week";
  return "none";
}

/** Due date color: red overdue, orange within 3 days (incl. today), else muted. */
export function dueDateToneClass(
  dueDate: string | null,
  todayKey: string,
  opts?: { complete?: boolean },
): string {
  if (!dueDate || opts?.complete) return "text-[var(--text-muted)]";
  const urgency = taskUrgency(dueDate, todayKey);
  if (urgency === "overdue") return "font-medium text-[var(--status-over)]";
  if (
    urgency === "today" ||
    urgency === "tomorrow" ||
    urgency === "three_days"
  ) {
    return "font-medium text-[var(--status-near)]";
  }
  return "text-[var(--text-muted)]";
}

export function reindexSortOrders<T extends { id: string; sort_order: number }>(
  items: T[],
): T[] {
  return items.map((item, i) => ({ ...item, sort_order: i }));
}

/** Person who assigned the task — creator profile, else project manager. */
export function taskAssignerPersonId(
  task: Pick<Task, "created_by_profile_id" | "assignee_person_id">,
  people: Pick<Person, "id" | "profile_id">[],
  project: Pick<Project, "manager_person_id"> | null,
): string | null {
  const creatorProfileId = task.created_by_profile_id;
  if (creatorProfileId) {
    const creator = people.find((p) => p.profile_id === creatorProfileId);
    if (creator) return creator.id;
  }
  return project?.manager_person_id ?? null;
}

/** Only the project PM or the task assigner may mark a task complete. */
export function canCompleteTask(
  viewerPersonId: string | null | undefined,
  task: Pick<Task, "created_by_profile_id" | "assignee_person_id">,
  people: Pick<Person, "id" | "profile_id">[],
  project: Pick<Project, "manager_person_id"> | null,
): boolean {
  if (!viewerPersonId) return false;
  if (project?.manager_person_id === viewerPersonId) return true;
  return taskAssignerPersonId(task, people, project) === viewerPersonId;
}

export const CLIENT_REVIEW_TITLE_PREFIX = "Client Review - ";

export function withClientReviewTitle(title: string): string {
  const t = title.trim();
  if (t.startsWith(CLIENT_REVIEW_TITLE_PREFIX)) return t;
  return `${CLIENT_REVIEW_TITLE_PREFIX}${t}`;
}

export function withoutClientReviewTitle(title: string): string {
  if (title.startsWith(CLIENT_REVIEW_TITLE_PREFIX)) {
    return title.slice(CLIENT_REVIEW_TITLE_PREFIX.length);
  }
  return title;
}

export function isClientReviewOpen(
  task: Pick<Task, "is_client_review" | "status" | "is_divider">,
): boolean {
  return (
    !task.is_divider &&
    task.is_client_review &&
    task.status !== "complete"
  );
}

export function isClientReviewApproved(
  task: Pick<Task, "is_client_review" | "status" | "is_divider">,
): boolean {
  return (
    !task.is_divider &&
    task.is_client_review &&
    task.status === "complete"
  );
}

/** Parent then children (by sort_order) for a single list. */
export function listDisplayOrder<
  T extends Pick<Task, "id" | "parent_id" | "sort_order" | "is_divider">,
>(tasks: T[]): T[] {
  const roots = tasks
    .filter((t) => !t.parent_id)
    .sort((a, b) => a.sort_order - b.sort_order);
  const byParent = new Map<string, T[]>();
  for (const t of tasks) {
    if (!t.parent_id) continue;
    const list = byParent.get(t.parent_id) ?? [];
    list.push(t);
    byParent.set(t.parent_id, list);
  }
  for (const kids of byParent.values()) {
    kids.sort((a, b) => a.sort_order - b.sort_order);
  }
  const out: T[] = [];
  for (const root of roots) {
    out.push(root);
    out.push(...(byParent.get(root.id) ?? []));
  }
  return out;
}

/**
 * True when an open Client Review appears before this task in list display
 * order (locks status / yellow chrome until that CR is approved).
 */
export function isDownstreamOfOpenClientReview(
  taskId: string,
  orderedTasks: Pick<
    Task,
    "id" | "is_client_review" | "status" | "is_divider"
  >[],
): boolean {
  for (const t of orderedTasks) {
    if (t.id === taskId) return false;
    if (isClientReviewOpen(t)) return true;
  }
  return false;
}

/** Client Review cycles Open (upcoming) ↔ Approved (complete) only. */
export function nextClientReviewStatus(
  status: TaskStatus,
): TaskStatus {
  return status === "complete" ? "upcoming" : "complete";
}

/** Shared visual tone for CR + downstream yellow lock across views. */
export type TaskVisualTone =
  | "normal"
  | "client_review_open"
  | "client_review_approved"
  | "downstream_locked";

export function taskVisualTone(
  task: Pick<Task, "id" | "is_client_review" | "status" | "is_divider">,
  orderedListTasks: Pick<
    Task,
    "id" | "is_client_review" | "status" | "is_divider"
  >[],
): TaskVisualTone {
  if (task.is_divider) return "normal";
  if (isClientReviewApproved(task)) return "client_review_approved";
  if (isClientReviewOpen(task)) return "client_review_open";
  if (isDownstreamOfOpenClientReview(task.id, orderedListTasks)) {
    return "downstream_locked";
  }
  return "normal";
}

export function taskVisualToneColor(tone: TaskVisualTone): string | null {
  if (tone === "client_review_open" || tone === "downstream_locked") {
    return "#f59e0b";
  }
  if (tone === "client_review_approved") {
    return "var(--status-healthy)";
  }
  return null;
}

/**
 * Assigner and/or assignee who should see a new task-thread comment when
 * someone else writes it (deduped when they are the same person).
 */
export function taskThreadRoleNotifyPersonIds(
  task: Pick<Task, "assignee_person_id" | "created_by_profile_id">,
  authorPersonId: string | null,
  people: Pick<Person, "id" | "profile_id">[],
  project: Pick<Project, "manager_person_id"> | null,
): string[] {
  if (!authorPersonId) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (personId: string | null | undefined) => {
    if (!personId || personId === authorPersonId || seen.has(personId)) return;
    seen.add(personId);
    out.push(personId);
  };
  add(task.assignee_person_id);
  add(taskAssignerPersonId(task, people, project));
  return out;
}

/** @deprecated Prefer taskThreadRoleNotifyPersonIds — first role notify target. */
export function taskThreadNotifyPersonId(
  task: Pick<Task, "assignee_person_id" | "created_by_profile_id">,
  authorPersonId: string | null,
  people: Pick<Person, "id" | "profile_id">[],
  project: Pick<Project, "manager_person_id"> | null,
): string | null {
  return (
    taskThreadRoleNotifyPersonIds(task, authorPersonId, people, project)[0] ??
    null
  );
}

/** @mentioned people (except the author) who should see the task-thread badge. */
export function taskThreadMentionNotifyPersonIds(
  mentionedPersonIds: string[] | undefined | null,
  authorPersonId: string | null,
): string[] {
  if (!mentionedPersonIds?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of mentionedPersonIds) {
    if (!id || id === authorPersonId || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * People subscribed to a task thread from prior activity: comment authors +
 * anyone @mentioned on any comment on the task.
 */
export function taskThreadSubscriberPersonIds(
  taskId: string,
  comments: Pick<
    TaskComment,
    "task_id" | "author_profile_id" | "mentioned_person_ids"
  >[],
  people: Pick<Person, "id" | "profile_id">[],
): string[] {
  const profileToPerson = new Map<string, string>();
  for (const p of people) {
    if (p.profile_id) profileToPerson.set(p.profile_id, p.id);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (personId: string | null | undefined) => {
    if (!personId || seen.has(personId)) return;
    seen.add(personId);
    out.push(personId);
  };
  for (const c of comments) {
    if (c.task_id !== taskId) continue;
    add(profileToPerson.get(c.author_profile_id) ?? null);
    for (const id of c.mentioned_person_ids ?? []) add(id);
  }
  return out;
}

/**
 * Full notify set for a new comment: assigner and/or assignee (when not the
 * author) plus thread subscribers (authors / @mentions), excluding the author.
 */
export function taskThreadNotifyPersonIds(
  task: Pick<Task, "id" | "assignee_person_id" | "created_by_profile_id">,
  authorPersonId: string | null,
  people: Pick<Person, "id" | "profile_id">[],
  project: Pick<Project, "manager_person_id"> | null,
  comments: Pick<
    TaskComment,
    "task_id" | "author_profile_id" | "mentioned_person_ids"
  >[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (personId: string | null | undefined) => {
    if (!personId || personId === authorPersonId || seen.has(personId)) return;
    seen.add(personId);
    out.push(personId);
  };
  for (const id of taskThreadRoleNotifyPersonIds(
    task,
    authorPersonId,
    people,
    project,
  )) {
    add(id);
  }
  for (const id of taskThreadSubscriberPersonIds(task.id, comments, people)) {
    add(id);
  }
  return out;
}

export function taskInReviewBulletinTitle(opts: {
  taskTitle: string;
  assigneeName: string | null;
  clientName: string | null;
  projectName: string;
}): string {
  const client = opts.clientName?.trim() || "Client";
  const project = opts.projectName?.trim() || "Project";
  const title = opts.taskTitle?.trim() || "A task";
  const assignee = opts.assigneeName?.trim();
  if (assignee) {
    return `${assignee} submitted "${title}" for review on the ${client} ${project} Project!`;
  }
  return `"${title}" is ready for review on the ${client} ${project} Project!`;
}

/** Green success bulletin when an assignee moves a task Active → In Review. */
export function buildTaskInReviewBulletin(opts: {
  id: string;
  organizationId: string;
  projectId: string;
  assignerPersonId: string;
  taskTitle: string;
  assigneeName: string | null;
  clientName: string | null;
  projectName: string;
  createdAt?: string;
}): Bulletin {
  return {
    id: opts.id,
    organization_id: opts.organizationId,
    project_id: opts.projectId,
    title: taskInReviewBulletinTitle({
      taskTitle: opts.taskTitle,
      assigneeName: opts.assigneeName,
      clientName: opts.clientName,
      projectName: opts.projectName,
    }),
    body: "",
    pinned: false,
    audience: "people",
    audience_person_ids: [opts.assignerPersonId],
    audience_pod_ids: [],
    tone: "success",
    created_by_profile_id: null,
    created_at: opts.createdAt ?? new Date().toISOString(),
  };
}

/** Assignee moved task from Active (upcoming) to In Review (active). */
export function isTaskInReviewTransition(
  previous: Pick<Task, "status"> | null | undefined,
  next: Pick<Task, "status">,
): boolean {
  return Boolean(previous && previous.status === "upcoming" && next.status === "active");
}

export function assigneeSubmittedTaskForReview(
  task: Pick<Task, "assignee_person_id" | "status_changed_by_profile_id">,
  people: Pick<Person, "id" | "profile_id">[],
  actorProfileId: string | null,
): boolean {
  if (!task.assignee_person_id || !actorProfileId) return false;
  const assignee = people.find((p) => p.id === task.assignee_person_id);
  if (!assignee?.profile_id || assignee.profile_id !== actorProfileId) {
    return false;
  }
  return (
    !task.status_changed_by_profile_id ||
    task.status_changed_by_profile_id === actorProfileId
  );
}
