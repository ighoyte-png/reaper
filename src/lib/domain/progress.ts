import type { Milestone, Project, Task } from "@/lib/types";

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

export function milestoneDateProgress(
  milestone: Milestone,
  project: Project,
  todayKey: string,
): number | null {
  const start = project.start_date;
  if (!start) return null;
  if (milestone.due_date <= start) return milestone.due_date <= todayKey ? 100 : 0;
  const s = new Date(`${start}T12:00:00`).getTime();
  const e = new Date(`${milestone.due_date}T12:00:00`).getTime();
  const t = new Date(`${todayKey}T12:00:00`).getTime();
  if (t <= s) return 0;
  if (t >= e) return 100;
  return Math.round(((t - s) / (e - s)) * 100);
}
