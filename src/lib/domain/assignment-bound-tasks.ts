import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import {
  assignmentPlacementConflicts,
  clipRangeToFreeDays,
} from "@/lib/domain/assignment-occupancy";
import { isOnFullDayLeave } from "@/lib/domain/capacity";
import { toDateKey, workingDaysBetween } from "@/lib/domain/dates";
import type {
  Assignment,
  AssignmentBoundSource,
  AssignmentBoundTask,
  LeaveDay,
  Task,
  TaskList,
} from "@/lib/types";

/** Marker so bind-generated assignment notes can be cleared on unbind. */
export const BOUND_TASKS_NOTES_MARKER = "<!--reaper-bound-tasks-->";

/** Assignment note when all bound tasks were deleted from the project. */
export const TASKS_REMOVED_NOTE = "Tasks Removed";

export type BoundNotesKind = "in_sync" | "out_of_sync";

export function boundTasksNotesHtml(
  titles: string[],
  kind: BoundNotesKind = "in_sync",
): string {
  const lines = titles
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => escapeHtml(t));
  if (lines.length === 0) return "";
  const heading =
    kind === "out_of_sync"
      ? "Task Dates out of Sync"
      : "Tasks Bound to Assignment";
  const items = lines.map((t) => `<li>${t}</li>`).join("");
  return `${BOUND_TASKS_NOTES_MARKER}<p><strong>${heading}</strong></p><ul>${items}</ul>`;
}

export function isBoundTasksNotes(html: string | null | undefined): boolean {
  return Boolean(html?.includes(BOUND_TASKS_NOTES_MARKER));
}

export function isTasksRemovedNote(html: string | null | undefined): boolean {
  if (!html) return false;
  const text = html.replace(/<[^>]+>/g, "").trim();
  return text === TASKS_REMOVED_NOTE;
}

export function tasksRemovedNotesHtml(): string {
  return `<p>${escapeHtml(TASKS_REMOVED_NOTE)}</p>`;
}

/** Bound tasks whose dates follow the assignment (skip Gantt-enabled lists). */
export function tasksToSyncForAssignmentBind<
  T extends { id: string; list_id: string; is_divider?: boolean },
  L extends { id: string; gantt_enabled?: boolean },
>(tasks: T[], taskLists: L[], boundTaskIds: string[]): T[] {
  const ganttLists = new Set(
    taskLists.filter((l) => l.gantt_enabled).map((l) => l.id),
  );
  const idSet = new Set(boundTaskIds);
  return tasks.filter(
    (t) => idSet.has(t.id) && !t.is_divider && !ganttLists.has(t.list_id),
  );
}

export function isGanttTask(
  task: Pick<Task, "list_id">,
  taskLists: Pick<TaskList, "id" | "gantt_enabled">[],
): boolean {
  const list = taskLists.find((l) => l.id === task.list_id);
  return Boolean(list?.gantt_enabled);
}

export function ganttControlledTaskIds(
  tasks: Pick<Task, "id" | "list_id">[],
  taskLists: Pick<TaskList, "id" | "gantt_enabled">[],
  taskIds: string[],
): Set<string> {
  const idSet = new Set(taskIds);
  const out = new Set<string>();
  for (const t of tasks) {
    if (idSet.has(t.id) && isGanttTask(t, taskLists)) out.add(t.id);
  }
  return out;
}

export function boundAssignmentsForTask(
  binds: Pick<AssignmentBoundTask, "assignment_id" | "task_id">[],
  assignments: Assignment[],
  taskId: string,
): Assignment[] {
  const ids = new Set(
    binds.filter((b) => b.task_id === taskId).map((b) => b.assignment_id),
  );
  return assignments
    .filter((a) => ids.has(a.id))
    .sort((a, b) =>
      a.start_date < b.start_date
        ? -1
        : a.start_date > b.start_date
          ? 1
          : a.end_date < b.end_date
            ? -1
            : a.end_date > b.end_date
              ? 1
              : 0,
    );
}

/**
 * Pick which bound assignment a task link should open on Schedule.
 * Prefer date overlap with the task, then current/upcoming, never the
 * earliest past assignment when a later match exists.
 */
export function preferredBoundAssignmentForTask(
  binds: Pick<AssignmentBoundTask, "assignment_id" | "task_id">[],
  assignments: Assignment[],
  task: Pick<Task, "id" | "start_date" | "due_date"> | null | undefined,
  todayKey: string = toDateKey(new Date()),
): Assignment | null {
  const bound = boundAssignmentsForTask(
    binds,
    assignments,
    task?.id ?? "",
  );
  if (bound.length === 0) return null;
  if (bound.length === 1) return bound[0];

  const taskStart = task?.start_date ?? null;
  const taskEnd = task?.due_date ?? null;
  if (taskStart || taskEnd) {
    const overlap = bound.find((a) => {
      const start = taskStart ?? taskEnd!;
      const end = taskEnd ?? taskStart!;
      return a.start_date <= end && a.end_date >= start;
    });
    if (overlap) return overlap;
    if (taskStart && taskEnd && taskStart === taskEnd) {
      const exact = bound.find(
        (a) => a.start_date === taskStart && a.end_date === taskEnd,
      );
      if (exact) return exact;
    }
  }

  const current = bound.find(
    (a) => a.start_date <= todayKey && a.end_date >= todayKey,
  );
  if (current) return current;

  const upcoming = bound.find((a) => a.start_date >= todayKey);
  if (upcoming) return upcoming;

  // Most recent past (bound is sorted earliest-first).
  return bound[bound.length - 1];
}

/** Earliest start + latest end across all assignments bound to the task. */
export function spanDatesForBoundTask(
  binds: Pick<AssignmentBoundTask, "assignment_id" | "task_id">[],
  assignments: Assignment[],
  taskId: string,
): { start: string; end: string } | null {
  const bound = boundAssignmentsForTask(binds, assignments, taskId);
  if (bound.length === 0) return null;
  let start = bound[0].start_date;
  let end = bound[0].end_date;
  for (const a of bound) {
    if (a.start_date < start) start = a.start_date;
    if (a.end_date > end) end = a.end_date;
  }
  return { start, end };
}

/**
 * True when any bound Gantt task on this assignment was bound from the project
 * (Schedule move must be locked).
 */
export function assignmentLockedOnSchedule(
  binds: AssignmentBoundTask[],
  tasks: Pick<Task, "id" | "list_id">[],
  taskLists: Pick<TaskList, "id" | "gantt_enabled">[],
  assignmentId: string,
): boolean {
  const rows = binds.filter((b) => b.assignment_id === assignmentId);
  if (rows.length === 0) return false;
  for (const row of rows) {
    if (row.bound_source !== "project") continue;
    const task = tasks.find((t) => t.id === row.task_id);
    if (task && isGanttTask(task, taskLists)) return true;
  }
  return false;
}

/** True when task dates match the bound assignment span (Gantt and non-Gantt). */
export function taskBoundDatesMatchSpan(
  taskId: string,
  binds: Pick<AssignmentBoundTask, "assignment_id" | "task_id">[],
  tasks: Pick<Task, "id" | "start_date" | "due_date">[],
  assignments: Assignment[],
): boolean {
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return true;
  const hasBinds = binds.some((b) => b.task_id === taskId);
  if (!hasBinds) return true;
  const bound = boundAssignmentsForTask(binds, assignments, taskId);
  // Bind rows exist but assignments are not loaded — treat as mismatched so
  // the UI does not show a false "synced" (green) state.
  if (bound.length === 0) return false;
  let start = bound[0].start_date;
  let end = bound[0].end_date;
  for (const a of bound) {
    if (a.start_date < start) start = a.start_date;
    if (a.end_date > end) end = a.end_date;
  }
  return task.start_date === start && task.due_date === end;
}

/** Task shows OOS when dates diverge from the bound assignment span. */
export function taskIsBoundOutOfSync(
  taskId: string,
  binds: AssignmentBoundTask[],
  tasks: Pick<Task, "id" | "start_date" | "due_date">[],
  assignments: Assignment[],
): boolean {
  const rows = binds.filter((b) => b.task_id === taskId);
  if (rows.length === 0) return false;
  return !taskBoundDatesMatchSpan(taskId, binds, tasks, assignments);
}

/**
 * Assignment shows OOS when any bound task's dates diverge from its span.
 * Ignores persisted `out_of_sync` flags (those are a derived cache).
 * Green only when every bound task matches.
 */
export function assignmentIsOutOfSync(
  binds: AssignmentBoundTask[],
  tasks: Pick<Task, "id" | "list_id" | "start_date" | "due_date">[],
  taskLists: Pick<TaskList, "id" | "gantt_enabled">[],
  assignments: Assignment[],
  assignmentId: string,
): boolean {
  const rows = binds.filter((b) => b.assignment_id === assignmentId);
  if (rows.length === 0) return false;
  for (const row of rows) {
    if (
      !taskBoundDatesMatchSpan(row.task_id, binds, tasks, assignments)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * True when a synced bound Gantt assignment must not move on the Schedule.
 * OOS Gantt binds remain movable regardless of bind origin.
 */
export function assignmentScheduleMoveLocked(
  binds: AssignmentBoundTask[],
  tasks: Pick<Task, "id" | "list_id" | "start_date" | "due_date">[],
  taskLists: Pick<TaskList, "id" | "gantt_enabled">[],
  assignments: Assignment[],
  assignmentId: string,
): boolean {
  const rows = binds.filter((b) => b.assignment_id === assignmentId);
  if (rows.length === 0) return false;
  const hasGantt = rows.some((row) => {
    const task = tasks.find((t) => t.id === row.task_id);
    return task ? isGanttTask(task, taskLists) : false;
  });
  if (!hasGantt) return false;
  return !assignmentIsOutOfSync(
    binds,
    tasks,
    taskLists,
    assignments,
    assignmentId,
  );
}

export type SyncTaskDatePatch = {
  taskId: string;
  start_date: string;
  due_date: string;
};

/** Patches for non-Gantt bound tasks whose dates don't match the binding span. */
export function syncNonGanttTaskDatesFromBindings(
  binds: AssignmentBoundTask[],
  tasks: Pick<
    Task,
    "id" | "list_id" | "start_date" | "due_date" | "is_divider"
  >[],
  taskLists: Pick<TaskList, "id" | "gantt_enabled">[],
  assignments: Assignment[],
  taskIds?: string[],
): SyncTaskDatePatch[] {
  const idFilter = taskIds ? new Set(taskIds) : null;
  const patches: SyncTaskDatePatch[] = [];
  const seen = new Set<string>();
  for (const row of binds) {
    if (idFilter && !idFilter.has(row.task_id)) continue;
    if (seen.has(row.task_id)) continue;
    seen.add(row.task_id);
    const task = tasks.find((t) => t.id === row.task_id);
    if (!task || task.is_divider || isGanttTask(task, taskLists)) continue;
    const span = spanDatesForBoundTask(binds, assignments, task.id);
    if (!span) continue;
    if (task.start_date === span.start && task.due_date === span.end) continue;
    patches.push({
      taskId: task.id,
      start_date: span.start,
      due_date: span.end,
    });
  }
  return patches;
}

/**
 * True when the desired span cannot be placed at its origin on this person+project
 * row (occupied origin or clipped shorter than requested).
 */
export function desiredRangeCollidesOnProjectRow(args: {
  personId: string;
  projectId: string;
  start: string;
  end: string;
  assignments: Assignment[];
  leaveDays: LeaveDay[];
  excludeAssignmentId?: string | null;
}): boolean {
  const lo = args.start <= args.end ? args.start : args.end;
  const hi = args.start <= args.end ? args.end : args.start;
  const desiredDays = workingDaysBetween(lo, hi);
  if (desiredDays.length === 0) return false;

  const clipped = clipRangeToFreeDays(
    args.personId,
    args.projectId,
    desiredDays[0]!,
    lo,
    hi,
    args.assignments,
    args.excludeAssignmentId,
    args.leaveDays,
  );
  if (!clipped) return true;
  const clippedDays = workingDaysBetween(clipped.start, clipped.end);
  return clippedDays.length < desiredDays.length;
}

/**
 * Find the next available contiguous working-day range for a Schedule
 * assignment. Does not mutate Gantt/task dates — Schedule only.
 */
export function nextAvailableScheduleRange(args: {
  personId: string;
  projectId: string;
  start: string;
  end: string;
  assignments: Assignment[];
  leaveDays: LeaveDay[];
  excludeAssignmentId?: string | null;
  /** Cap how far into the future we search (working days). */
  maxSearchWorkingDays?: number;
}): { start: string; end: string } | null {
  const spanDays = workingDaysBetween(args.start, args.end);
  const length = Math.max(1, spanDays.length);
  let cursor = args.start;
  // If start is weekend / leave, advance to next free working day.
  const hardStop = 400;
  let guard = 0;
  while (guard++ < hardStop) {
    const days = workingDaysBetween(cursor, cursor);
    const day = days[0] ?? cursor;
    if (
      !isOnFullDayLeave(args.personId, day, args.leaveDays) &&
      !occupiedDay(
        args.personId,
        args.projectId,
        day,
        args.assignments,
        args.excludeAssignmentId,
      )
    ) {
      cursor = day;
      break;
    }
    cursor = toDateKey(addDays(parseISO(day), 1));
  }

  const maxSearch = args.maxSearchWorkingDays ?? 120;
  let attempts = 0;
  let probe = cursor;
  while (attempts++ < maxSearch) {
    const endProbe = extendWorkingDays(probe, length - 1);
    const clipped = clipRangeToFreeDays(
      args.personId,
      args.projectId,
      probe,
      probe,
      endProbe,
      args.assignments,
      args.excludeAssignmentId,
      args.leaveDays,
    );
    if (clipped) {
      const clippedLen = workingDaysBetween(clipped.start, clipped.end).length;
      if (clippedLen >= length || clipped.start === probe) {
        // Prefer exact length when possible; otherwise take contiguous free run.
        const days = workingDaysBetween(clipped.start, clipped.end);
        if (days.length >= length) {
          return {
            start: days[0],
            end: days[length - 1],
          };
        }
        return { start: clipped.start, end: clipped.end };
      }
    }
    probe = toDateKey(addDays(parseISO(probe), 1));
    // Skip weekends quickly via workingDaysBetween origin.
    const wd = workingDaysBetween(probe, probe);
    if (wd.length === 0) {
      probe = toDateKey(addDays(parseISO(probe), 1));
    } else {
      probe = wd[0];
    }
  }
  return null;
}

function occupiedDay(
  personId: string,
  projectId: string,
  day: string,
  assignments: Assignment[],
  excludeAssignmentId?: string | null,
): boolean {
  return assignments.some(
    (a) =>
      a.id !== excludeAssignmentId &&
      a.person_id === personId &&
      a.project_id === projectId &&
      a.start_date <= day &&
      a.end_date >= day,
  );
}

function extendWorkingDays(startKey: string, extraWorkingDays: number): string {
  if (extraWorkingDays <= 0) return startKey;
  let d = parseISO(startKey);
  let left = extraWorkingDays;
  while (left > 0) {
    d = addDays(d, 1);
    const key = toDateKey(d);
    if (workingDaysBetween(key, key).length > 0) left -= 1;
  }
  return toDateKey(d);
}

export type ShiftAssignmentResult =
  | { ok: true; start: string; end: string }
  | { ok: false; reason: "conflict" };

/**
 * Shift an assignment by calendar days (Gantt delta), then snap onto Schedule
 * availability. Does not change Gantt dates.
 */
export function tryShiftAssignmentByDays(args: {
  assignment: Assignment;
  calendarDayDelta: number;
  assignments: Assignment[];
  leaveDays: LeaveDay[];
}): ShiftAssignmentResult {
  if (args.calendarDayDelta === 0) {
    return {
      ok: true,
      start: args.assignment.start_date,
      end: args.assignment.end_date,
    };
  }
  const rawStart = toDateKey(
    addDays(parseISO(args.assignment.start_date), args.calendarDayDelta),
  );
  const rawEnd = toDateKey(
    addDays(parseISO(args.assignment.end_date), args.calendarDayDelta),
  );
  const available = nextAvailableScheduleRange({
    personId: args.assignment.person_id,
    projectId: args.assignment.project_id,
    start: rawStart,
    end: rawEnd,
    assignments: args.assignments,
    leaveDays: args.leaveDays,
    excludeAssignmentId: args.assignment.id,
  });
  if (!available) return { ok: false, reason: "conflict" };

  const candidate: Assignment = {
    ...args.assignment,
    start_date: available.start,
    end_date: available.end,
  };
  const padStart = toDateKey(addDays(parseISO(available.start), -20));
  const padEnd = toDateKey(addDays(parseISO(available.end), 60));
  if (
    assignmentPlacementConflicts(
      candidate,
      args.assignments,
      padStart,
      padEnd,
    )
  ) {
    return { ok: false, reason: "conflict" };
  }
  return { ok: true, start: available.start, end: available.end };
}

/** Calendar-day delta between two date keys (can include weekends). */
export function calendarDayDelta(fromKey: string, toKey: string): number {
  return differenceInCalendarDays(parseISO(toKey), parseISO(fromKey));
}

export function normalizeBoundSource(
  value: unknown,
): AssignmentBoundSource {
  return value === "project" ? "project" : "schedule";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
