import type {
  Bulletin,
  Person,
  Project,
  Task,
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

/** Assigner ↔ assignee counterpart who should see a new task-thread comment. */
export function taskThreadNotifyPersonId(
  task: Pick<Task, "assignee_person_id" | "created_by_profile_id">,
  authorPersonId: string | null,
  people: Pick<Person, "id" | "profile_id">[],
  project: Pick<Project, "manager_person_id"> | null,
): string | null {
  if (!authorPersonId) return null;
  const assigneeId = task.assignee_person_id;
  const assignerId = taskAssignerPersonId(task, people, project);
  if (!assigneeId || !assignerId) return null;
  if (authorPersonId === assignerId && authorPersonId !== assigneeId) {
    return assigneeId;
  }
  if (authorPersonId === assigneeId && authorPersonId !== assignerId) {
    return assignerId;
  }
  return null;
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
