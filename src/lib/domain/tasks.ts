import type { Task, TaskList, TaskStatus } from "@/lib/types";

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

export function childTasks(tasks: Task[], parentId: string): Task[] {
  return tasks
    .filter((t) => t.parent_id === parentId)
    .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title));
}

/** Managers see all; members see only tasks assigned to them (including parent if any child is theirs). */
export function filterTasksForViewer(
  tasks: Task[],
  canManage: boolean,
  myPersonId: string | null,
): Task[] {
  if (canManage || !myPersonId) {
    if (canManage) return tasks;
    return [];
  }
  const mine = new Set(
    tasks.filter((t) => t.assignee_person_id === myPersonId).map((t) => t.id),
  );
  return tasks.filter(
    (t) =>
      mine.has(t.id) ||
      (t.parent_id && mine.has(t.parent_id)) ||
      (!t.parent_id && tasks.some((c) => c.parent_id === t.id && mine.has(c.id))),
  );
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

export function reindexSortOrders<T extends { id: string; sort_order: number }>(
  items: T[],
): T[] {
  return items.map((item, i) => ({ ...item, sort_order: i }));
}
