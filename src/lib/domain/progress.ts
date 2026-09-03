import type { Milestone, Project, Task, TaskList } from "@/lib/types";

/** Calendar progress from project start→end (0–100). */
export function projectDateProgress(
  project: Project,
  todayKey: string,
): number | null {
  if (!project.start_date || !project.end_date) return null;
  if (project.end_date <= project.start_date) return null;
  const start = new Date(`${project.start_date}T12:00:00`).getTime();
  const end = new Date(`${project.end_date}T12:00:00`).getTime();
  const today = new Date(`${todayKey}T12:00:00`).getTime();
  if (today <= start) return 0;
  if (today >= end) return 100;
  return Math.round(((today - start) / (end - start)) * 100);
}

/** Task completion % for a project (parents only). */
export function projectTaskProgress(tasks: Task[], projectId: string): number {
  const parents = tasks.filter(
    (t) => t.project_id === projectId && !t.parent_id,
  );
  if (parents.length === 0) return 0;
  const done = parents.filter((t) => t.status === "complete").length;
  return Math.round((done / parents.length) * 100);
}

export function milestoneTaskProgress(
  tasks: Task[],
  listIds: string[],
): number {
  const parents = tasks.filter(
    (t) => listIds.includes(t.list_id) && !t.parent_id,
  );
  if (parents.length === 0) return 0;
  const done = parents.filter((t) => t.status === "complete").length;
  return Math.round((done / parents.length) * 100);
}

/** Task list linked to a milestone via `task_lists.milestone_id`. */
export function findListAttachedToMilestone(
  lists: readonly Pick<TaskList, "id" | "milestone_id" | "start_date" | "end_date">[],
  milestoneId: string,
): Pick<TaskList, "id" | "milestone_id" | "start_date" | "end_date"> | null {
  return lists.find((l) => l.milestone_id === milestoneId) ?? null;
}

function calendarProgressBetween(
  startKey: string,
  endKey: string,
  todayKey: string,
): number {
  if (endKey <= startKey) return endKey <= todayKey ? 100 : 0;
  const s = new Date(`${startKey}T12:00:00`).getTime();
  const e = new Date(`${endKey}T12:00:00`).getTime();
  const t = new Date(`${todayKey}T12:00:00`).getTime();
  if (t <= s) return 0;
  if (t >= e) return 100;
  return Math.round(((t - s) / (e - s)) * 100);
}

/**
 * Calendar progress for a milestone.
 * When attached to a task list with both start and end dates, uses that list’s window.
 */
export function milestoneDateProgress(
  milestone: Milestone,
  project: Project,
  todayKey: string,
  attachedList?: Pick<TaskList, "start_date" | "end_date"> | null,
): number | null {
  if (attachedList?.start_date && attachedList?.end_date) {
    return calendarProgressBetween(
      attachedList.start_date,
      attachedList.end_date,
      todayKey,
    );
  }
  if (!milestone.due_date) return null;
  const start = milestone.start_date ?? project.start_date;
  if (!start) return null;
  return calendarProgressBetween(start, milestone.due_date, todayKey);
}
