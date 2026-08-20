import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import type { CSSProperties } from "react";
import { toDateKey } from "@/lib/domain/dates";
import {
  isClientReviewApproved,
  isClientReviewOpen,
  listDisplayOrder,
  taskVisualTone,
} from "@/lib/domain/tasks";
import type { Milestone, Task, TaskList } from "@/lib/types";

/** Match Schedule label / day widths (schedule-grid LABEL_DESKTOP / DAY_W_*). */
export const GANTT_LABEL_PX = 248;
/** Narrow rail when the task-list name column is collapsed. */
export const GANTT_LABEL_COLLAPSED_PX = 40;
/** Match Schedule ROW_H (DAY_H 32 + DAY_PAD_Y*2). */
export const GANTT_LIST_ROW_H = 38;
/** Task rows are 2/3 the height of Task List rows. */
export const GANTT_TASK_ROW_H = Math.round((GANTT_LIST_ROW_H * 2) / 3);
export const GANTT_DAY_W_DESKTOP = 48;
export const GANTT_DAY_W_NARROW = 40;

export const GANTT_HATCH_STYLE: CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(-45deg, transparent, transparent 3px, var(--progress-approved-hatch) 3px, var(--progress-approved-hatch) 5px)",
};

export type GanttBarDates = {
  startKey: string;
  endKey: string;
};

export type GanttRowKind = "list" | "task" | "milestone";

export type GanttRow =
  | {
      kind: "list";
      id: string;
      list: TaskList;
      dates: GanttBarDates;
    }
  | {
      kind: "task";
      id: string;
      task: Task;
      list: TaskList;
      dates: GanttBarDates;
    }
  | {
      kind: "milestone";
      id: string;
      milestone: Milestone;
      list: TaskList;
      dates: GanttBarDates;
    };

/** Active Gantt lists for a project (non-archived, gantt_enabled). */
export function ganttListsForProject(
  lists: TaskList[],
  projectId: string,
): TaskList[] {
  return lists
    .filter(
      (l) => l.project_id === projectId && !l.archived && l.gantt_enabled,
    )
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

/** Tasks in a list for Gantt (no dividers), parent then children order. */
export function ganttTasksForList(tasks: Task[], listId: string): Task[] {
  const listTasks = tasks.filter((t) => t.list_id === listId && !t.is_divider);
  return listDisplayOrder(listTasks);
}

export function shiftDateKey(key: string, deltaDays: number): string {
  return toDateKey(addDays(parseISO(key), deltaDays));
}

export function clampDateRange(
  startKey: string,
  endKey: string,
): { startKey: string; endKey: string } {
  return startKey <= endKey
    ? { startKey, endKey }
    : { startKey: endKey, endKey: startKey };
}

export function calendarDayDelta(fromKey: string, toKey: string): number {
  return differenceInCalendarDays(parseISO(toKey), parseISO(fromKey));
}

/** Inclusive calendar-day count between two date keys. */
export function inclusiveDayCount(startKey: string, endKey: string): number {
  const { startKey: s, endKey: e } = clampDateRange(startKey, endKey);
  return differenceInCalendarDays(parseISO(e), parseISO(s)) + 1;
}

export function resolveListBarDates(
  list: TaskList,
  fallbackKey: string,
): GanttBarDates {
  if (list.start_date && list.end_date) {
    return clampDateRange(list.start_date, list.end_date);
  }
  if (list.start_date) {
    return { startKey: list.start_date, endKey: list.start_date };
  }
  if (list.end_date) {
    return { startKey: list.end_date, endKey: list.end_date };
  }
  return { startKey: fallbackKey, endKey: fallbackKey };
}

export function resolveTaskBarDates(
  task: Task,
  list: TaskList,
  fallbackKey: string,
): GanttBarDates {
  const start =
    task.start_date ?? (task.due_date ? list.start_date ?? null : null);
  const end = task.due_date ?? task.start_date;
  if (start && end) return clampDateRange(start, end);
  if (start) return { startKey: start, endKey: start };
  if (end) return { startKey: end, endKey: end };
  return { startKey: fallbackKey, endKey: fallbackKey };
}

export function resolveMilestoneBarDates(
  milestone: Milestone,
): GanttBarDates | null {
  const key = milestone.due_date ?? milestone.start_date;
  if (!key) return null;
  return { startKey: key, endKey: key };
}

/** Project overall timeline bar dates (for Gantt header row). */
export function resolveProjectBarDates(
  project: { start_date: string | null; end_date: string | null },
  fallbackKey: string,
): GanttBarDates {
  if (project.start_date && project.end_date) {
    return clampDateRange(project.start_date, project.end_date);
  }
  if (project.start_date) {
    return { startKey: project.start_date, endKey: project.start_date };
  }
  if (project.end_date) {
    return { startKey: project.end_date, endKey: project.end_date };
  }
  return { startKey: fallbackKey, endKey: fallbackKey };
}

/** Incomplete milestone chrome (done uses --status-healthy). */
export const MILESTONE_PURPLE = "#673AB7";

export function listHasOverdueOpenTasks(
  tasks: Task[],
  todayKey: string,
): boolean {
  return tasks.some(
    (t) =>
      !t.is_divider &&
      t.status !== "complete" &&
      t.due_date != null &&
      t.due_date < todayKey,
  );
}

export function listBarColor(
  list: TaskList,
  tasks: Task[],
  todayKey: string,
): string {
  if (listHasOverdueOpenTasks(tasks, todayKey)) {
    return "var(--status-over)";
  }
  if (listIsComplete(list, tasks, todayKey)) {
    return "var(--status-healthy)";
  }
  return "var(--accent)";
}

/** List end date has arrived and there are no overdue incomplete tasks. */
export function listIsComplete(
  list: Pick<TaskList, "end_date">,
  tasks: Task[],
  todayKey: string,
): boolean {
  return Boolean(
    list.end_date &&
      todayKey >= list.end_date &&
      !listHasOverdueOpenTasks(tasks, todayKey),
  );
}

export function taskBarColor(
  task: Task,
  todayKey: string,
  orderedListTasks?: Task[],
): string {
  const ordered = orderedListTasks ?? [task];
  const tone = taskVisualTone(task, ordered);
  if (tone === "client_review_approved") return "var(--status-healthy)";
  if (tone === "client_review_open" || tone === "downstream_locked") {
    return "#f59e0b";
  }
  if (task.status === "complete") return "var(--text-muted)";
  if (task.due_date && task.due_date < todayKey) {
    return "var(--status-over)";
  }
  if (task.status === "active") return "var(--status-healthy)";
  return "var(--accent)";
}

export function taskShowsClientReviewStar(task: Task): boolean {
  return isClientReviewOpen(task) || isClientReviewApproved(task);
}

/** Fraction of bar width that is on or before today (for solid vs hatch split). */
export function barPastFutureSplit(
  startKey: string,
  endKey: string,
  todayKey: string,
): { pastFraction: number; hasFuture: boolean } {
  const { startKey: start, endKey: end } = clampDateRange(startKey, endKey);
  const total = inclusiveDayCount(start, end);
  if (todayKey < start) return { pastFraction: 0, hasFuture: true };
  if (todayKey > end) return { pastFraction: 1, hasFuture: false };
  const pastDays = inclusiveDayCount(start, todayKey);
  return {
    pastFraction: Math.min(1, Math.max(0, pastDays / total)),
    hasFuture: todayKey < end,
  };
}

export function buildGanttRows(
  lists: TaskList[],
  tasks: Task[],
  milestones: Milestone[],
  fallbackKey: string,
): GanttRow[] {
  const rows: GanttRow[] = [];
  for (const list of lists) {
    rows.push({
      kind: "list",
      id: `list:${list.id}`,
      list,
      dates: resolveListBarDates(list, fallbackKey),
    });
    const listTasks = ganttTasksForList(tasks, list.id);
    for (const task of listTasks) {
      rows.push({
        kind: "task",
        id: `task:${task.id}`,
        task,
        list,
        dates: resolveTaskBarDates(task, list, fallbackKey),
      });
    }
    if (list.milestone_id) {
      const milestone = milestones.find((m) => m.id === list.milestone_id);
      if (milestone) {
        const dates = resolveMilestoneBarDates(milestone);
        if (dates) {
          rows.push({
            kind: "milestone",
            id: `milestone:${milestone.id}`,
            milestone,
            list,
            dates,
          });
        }
      }
    }
  }
  return rows;
}
