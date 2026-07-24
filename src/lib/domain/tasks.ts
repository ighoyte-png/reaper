import type { Task, TaskList, TaskStatus } from "@/lib/types";

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
    .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title));
}

export function taskStatusLabel(status: TaskStatus): string {
  switch (status) {
    case "upcoming":
      return "Upcoming";
    case "active":
      return "Active";
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
