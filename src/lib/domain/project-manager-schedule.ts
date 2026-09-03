import { addDays, parseISO } from "date-fns";
import {
  getWeekdays,
  toDateKey,
  weekStart,
  workingDaysBetween,
} from "@/lib/domain/dates";
import { isOnFullDayLeave } from "@/lib/domain/capacity";
import { roundAssignmentHours } from "@/lib/domain/budget";
import { expandAssignmentInRange } from "@/lib/domain/recurrence";
import type { Assignment, AssignmentBoundTask, LeaveDay } from "@/lib/types";

/** Assignments for this project manager on this project. */
export function findPmProjectAssignments(
  assignments: Assignment[],
  managerPersonId: string,
  projectId: string,
): Assignment[] {
  return assignments.filter(
    (a) => a.person_id === managerPersonId && a.project_id === projectId,
  );
}

/** Assignment ids that have at least one bound task (protected from PM overwrite). */
export function assignmentIdsWithBoundTasks(
  boundTasks: Pick<AssignmentBoundTask, "assignment_id">[],
): Set<string> {
  const ids = new Set<string>();
  for (const row of boundTasks) {
    if (row.assignment_id) ids.add(row.assignment_id);
  }
  return ids;
}

export function isProtectedPmAssignment(
  assignmentId: string,
  protectedIds: Set<string> | Iterable<string>,
): boolean {
  const set =
    protectedIds instanceof Set ? protectedIds : new Set(protectedIds);
  return set.has(assignmentId);
}

/** Split PM+project assignments into bound-task protected vs replaceable. */
export function partitionPmProjectAssignments(
  existing: Assignment[],
  protectedIds: Set<string> | Iterable<string>,
): { protected: Assignment[]; replaceable: Assignment[] } {
  const set =
    protectedIds instanceof Set ? protectedIds : new Set(protectedIds);
  const protectedRows: Assignment[] = [];
  const replaceable: Assignment[] = [];
  for (const a of existing) {
    if (set.has(a.id)) protectedRows.push(a);
    else replaceable.push(a);
  }
  return { protected: protectedRows, replaceable };
}

/**
 * Working days covered by protected PM assignments in [rangeStart, rangeEnd].
 * Used to carve holes out of newly built PM daily-hours series.
 */
export function protectedPmOccurrenceDates(
  protectedAssignments: Assignment[],
  rangeStart: string,
  rangeEnd: string,
): string[] {
  const lo = rangeStart <= rangeEnd ? rangeStart : rangeEnd;
  const hi = rangeStart <= rangeEnd ? rangeEnd : rangeStart;
  const days = new Set<string>();
  for (const assignment of protectedAssignments) {
    for (const occ of expandAssignmentInRange(assignment, lo, hi)) {
      for (const day of workingDaysBetween(occ.start_date, occ.end_date)) {
        if (day >= lo && day <= hi) days.add(day);
      }
    }
  }
  return [...days].sort();
}

function assignmentSpanDays(a: Assignment): number {
  return workingDaysBetween(a.start_date, a.end_date).length;
}

/**
 * Prefer longest contiguous span, then weekly series, then stable id —
 * used for prefill hours and align keep-hours.
 */
export function pickPmAssignmentWinner(
  assignments: Assignment[],
): Assignment | null {
  if (assignments.length === 0) return null;
  return [...assignments].sort((a, b) => {
    const span = assignmentSpanDays(b) - assignmentSpanDays(a);
    if (span !== 0) return span;
    const aWeekly = (a.recurrence ?? "none") === "weekly" ? 1 : 0;
    const bWeekly = (b.recurrence ?? "none") === "weekly" ? 1 : 0;
    if (bWeekly !== aWeekly) return bWeekly - aWeekly;
    return a.id.localeCompare(b.id);
  })[0];
}

export function existingPmDailyHours(
  assignments: Assignment[],
  managerPersonId: string,
  projectId: string,
  boundTasks: Pick<AssignmentBoundTask, "assignment_id">[] = [],
): number | null {
  const existing = findPmProjectAssignments(
    assignments,
    managerPersonId,
    projectId,
  );
  const protectedIds = assignmentIdsWithBoundTasks(boundTasks);
  const { replaceable } = partitionPmProjectAssignments(existing, protectedIds);
  const winner = pickPmAssignmentWinner(replaceable);
  return winner ? winner.hours_per_day : null;
}

export function projectTimelineDatesChanged(
  before: { start_date: string | null; end_date: string | null } | null,
  after: { start_date: string | null; end_date: string | null },
): boolean {
  if (!before) return false;
  return (
    (before.start_date ?? null) !== (after.start_date ?? null) ||
    (before.end_date ?? null) !== (after.end_date ?? null)
  );
}

/**
 * Mon–Fri template for the first project week, clipped to [start, end].
 * `recurrence_end_date` is the project end date.
 * @deprecated Prefer buildPmScheduleAssignments for mid-week starts.
 */
export function buildPmWeeklyAssignment(args: {
  id: string;
  organizationId: string;
  personId: string;
  projectId: string;
  startDate: string;
  endDate: string;
  hoursPerDay: number;
}): Assignment | null {
  const rows = buildPmScheduleAssignments({
    ...args,
    newId: () => args.id,
  });
  return rows[0] ?? null;
}

function pmAssignmentRow(
  args: {
    id: string;
    organizationId: string;
    personId: string;
    projectId: string;
    hoursPerDay: number;
  },
  start: string,
  end: string,
  recurrence: Assignment["recurrence"],
  recurrenceEnd: string | null,
): Assignment {
  const hours = Math.max(0.01, roundAssignmentHours(args.hoursPerDay));
  return {
    id: args.id,
    organization_id: args.organizationId,
    person_id: args.personId,
    project_id: args.projectId,
    start_date: start,
    end_date: end,
    hours_per_day: hours,
    allocation_pct: null,
    status: "confirmed",
    notes: "Project management",
    recurrence,
    recurrence_end_date: recurrenceEnd,
    recurrence_exceptions: [],
    created_at: new Date().toISOString(),
    edited_at: null,
    edited_by_profile_id: null,
  };
}

/**
 * PM schedule rows: optional partial first week, then weekly Mon–Fri through
 * project end (last occurrence clipped by recurrence_end_date).
 */
export function buildPmScheduleAssignments(args: {
  newId: () => string;
  organizationId: string;
  personId: string;
  projectId: string;
  startDate: string;
  endDate: string;
  hoursPerDay: number;
}): Assignment[] {
  const lo =
    args.startDate <= args.endDate ? args.startDate : args.endDate;
  const hi =
    args.startDate <= args.endDate ? args.endDate : args.startDate;
  const days = workingDaysBetween(lo, hi);
  if (days.length === 0) return [];

  const weekAnchor = weekStart(parseISO(lo));
  const monday = toDateKey(getWeekdays(weekAnchor)[0]);
  const friday = toDateKey(getWeekdays(weekAnchor)[4]);

  if (lo <= monday) {
    return [
      pmAssignmentRow(
        { ...args, id: args.newId() },
        monday,
        friday,
        "weekly",
        hi,
      ),
    ];
  }

  const firstEnd = friday <= hi ? friday : hi;
  const firstDays = workingDaysBetween(lo, firstEnd);
  if (firstDays.length === 0) return [];

  const rows: Assignment[] = [
    pmAssignmentRow(
      { ...args, id: args.newId() },
      firstDays[0],
      firstDays[firstDays.length - 1],
      "none",
      null,
    ),
  ];

  if (friday >= hi) return rows;

  const seriesMonday = nextWorkingDay(friday);
  if (seriesMonday > hi) return rows;

  const seriesFriday = toDateKey(
    getWeekdays(weekStart(parseISO(seriesMonday)))[4],
  );
  rows.push(
    pmAssignmentRow(
      { ...args, id: args.newId() },
      seriesMonday,
      seriesFriday,
      "weekly",
      hi,
    ),
  );
  return rows;
}

export type PmScheduleIntent =
  | { kind: "none" }
  | { kind: "need_dates" }
  | { kind: "create"; hours: number }
  | { kind: "overwrite"; hours: number }
  | { kind: "align"; hours: number };

/**
 * Decide whether to create / overwrite / align PM schedule time after a
 * project save. Overwrite only when daily hours or timeline dates changed —
 * unrelated project edits should not prompt.
 *
 * Bound-task assignments are excluded from overwrite/align detection so
 * production blocks never trigger a "replace all" prompt.
 */
export function resolvePmScheduleIntent(args: {
  /** Parsed daily hours from the form; null when blank. */
  pmDailyHours: number | null;
  managerPersonId: string | null;
  startDate: string | null;
  endDate: string | null;
  existing: Assignment[];
  datesChanged: boolean;
  boundTasks?: Pick<AssignmentBoundTask, "assignment_id">[];
}): PmScheduleIntent {
  const {
    pmDailyHours,
    managerPersonId,
    startDate,
    endDate,
    existing,
    datesChanged,
  } = args;

  if (!managerPersonId) return { kind: "none" };

  const protectedIds = assignmentIdsWithBoundTasks(args.boundTasks ?? []);
  const { replaceable } = partitionPmProjectAssignments(existing, protectedIds);

  const hasHours =
    pmDailyHours != null && Number.isFinite(pmDailyHours) && pmDailyHours > 0;

  if (hasHours) {
    if (!startDate || !endDate) return { kind: "need_dates" };
    if (replaceable.length > 0) {
      const winner = pickPmAssignmentWinner(replaceable);
      const existingHours = winner
        ? roundAssignmentHours(winner.hours_per_day)
        : null;
      const nextHours = roundAssignmentHours(pmDailyHours);
      const hoursChanged =
        existingHours == null || existingHours !== nextHours;
      if (hoursChanged || datesChanged) {
        return { kind: "overwrite", hours: pmDailyHours };
      }
      return { kind: "none" };
    }
    return { kind: "create", hours: pmDailyHours };
  }

  if (datesChanged && replaceable.length > 0 && startDate && endDate) {
    const winner = pickPmAssignmentWinner(replaceable);
    if (!winner) return { kind: "none" };
    return { kind: "align", hours: winner.hours_per_day };
  }

  return { kind: "none" };
}

/** Full-day leave dates for a person in [start, end] (inclusive). */
export function fullDayLeaveDatesInRange(
  leaveDays: {
    person_id: string;
    date: string;
    status: string;
    kind: string;
    hours_per_day: number | null;
  }[],
  personId: string,
  startDate: string,
  endDate: string,
  isFullDay: (leave: {
    kind: string;
    hours_per_day: number | null;
  }) => boolean,
): string[] {
  const lo = startDate <= endDate ? startDate : endDate;
  const hi = startDate <= endDate ? endDate : startDate;
  return leaveDays
    .filter(
      (l) =>
        l.person_id === personId &&
        l.status === "approved" &&
        l.date >= lo &&
        l.date <= hi &&
        isFullDay(l),
    )
    .map((l) => l.date)
    .sort();
}

/** Advance one working day (for docs / tests). */
export function nextWorkingDay(dateKey: string): string {
  let d = addDays(parseISO(dateKey), 1);
  while (d.getDay() === 0 || d.getDay() === 6) d = addDays(d, 1);
  return toDateKey(d);
}

/** Previous working day (Mon–Fri). */
export function prevWorkingDay(dateKey: string): string {
  let d = addDays(parseISO(dateKey), -1);
  while (d.getDay() === 0 || d.getDay() === 6) d = addDays(d, -1);
  return toDateKey(d);
}

function isWeekendKey(dateKey: string): boolean {
  const dow = parseISO(dateKey).getDay();
  return dow === 0 || dow === 6;
}

/** Next working day that is not in `leaveDates`, or the date itself if already free. */
export function nextAvailableScheduleDay(
  dateKey: string,
  leaveDates: Iterable<string> = [],
): string {
  const leave = leaveDates instanceof Set ? leaveDates : new Set(leaveDates);
  if (!isWeekendKey(dateKey) && !leave.has(dateKey)) return dateKey;
  let cursor = dateKey;
  for (let i = 0; i < 366; i += 1) {
    cursor = nextWorkingDay(cursor);
    if (!leave.has(cursor)) return cursor;
  }
  return dateKey;
}

/** Previous working day that is not in `leaveDates`, or the date itself if already free. */
export function prevAvailableScheduleDay(
  dateKey: string,
  leaveDates: Iterable<string> = [],
): string {
  const leave = leaveDates instanceof Set ? leaveDates : new Set(leaveDates);
  if (!isWeekendKey(dateKey) && !leave.has(dateKey)) return dateKey;
  let cursor = dateKey;
  for (let i = 0; i < 366; i += 1) {
    cursor = prevWorkingDay(cursor);
    if (!leave.has(cursor)) return cursor;
  }
  return dateKey;
}

/**
 * Clip a project timeline onto schedule days: start rolls forward off
 * weekends/leave; end rolls backward off weekends/leave.
 */
export function snapPmTimelineToScheduleDays(
  startDate: string,
  endDate: string,
  leaveDates: Iterable<string> = [],
): { start: string; end: string } | null {
  const lo = startDate <= endDate ? startDate : endDate;
  const hi = startDate <= endDate ? endDate : startDate;
  const leave = leaveDates instanceof Set ? leaveDates : new Set(leaveDates);
  const start = nextAvailableScheduleDay(lo, leave);
  const end = prevAvailableScheduleDay(hi, leave);
  if (start > end) return null;
  return { start, end };
}

/**
 * Dashboard schedule: use today on weekdays when not on full-day leave;
 * otherwise roll forward to the next working, non-leave day.
 */
export function scheduleDisplayDayKey(
  todayKey: string,
  personId: string,
  leaveDays: LeaveDay[],
): { dayKey: string; isToday: boolean } {
  if (!isWeekendKey(todayKey) && !isOnFullDayLeave(personId, todayKey, leaveDays)) {
    return { dayKey: todayKey, isToday: true };
  }
  let cursor = todayKey;
  for (let i = 0; i < 366; i += 1) {
    cursor = nextWorkingDay(cursor);
    if (!isOnFullDayLeave(personId, cursor, leaveDays)) {
      return { dayKey: cursor, isToday: false };
    }
  }
  return { dayKey: todayKey, isToday: false };
}
