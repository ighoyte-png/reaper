import { addDays, parseISO } from "date-fns";
import {
  getWeekdays,
  toDateKey,
  weekStart,
  workingDaysBetween,
} from "@/lib/domain/dates";
import { isOnFullDayLeave } from "@/lib/domain/capacity";
import { roundAssignmentHours } from "@/lib/domain/budget";
import type { Assignment, LeaveDay } from "@/lib/types";

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
): number | null {
  const existing = findPmProjectAssignments(
    assignments,
    managerPersonId,
    projectId,
  );
  const winner = pickPmAssignmentWinner(existing);
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
  const lo =
    args.startDate <= args.endDate ? args.startDate : args.endDate;
  const hi =
    args.startDate <= args.endDate ? args.endDate : args.startDate;
  const days = workingDaysBetween(lo, hi);
  if (days.length === 0) return null;

  const first = days[0];
  const weekDays = getWeekdays(weekStart(parseISO(first)))
    .map(toDateKey)
    .filter((d) => d >= lo && d <= hi);
  if (weekDays.length === 0) return null;

  const hours = Math.max(0.01, roundAssignmentHours(args.hoursPerDay));

  return {
    id: args.id,
    organization_id: args.organizationId,
    person_id: args.personId,
    project_id: args.projectId,
    start_date: weekDays[0],
    end_date: weekDays[weekDays.length - 1],
    hours_per_day: hours,
    allocation_pct: null,
    status: "confirmed",
    notes: "Project management",
    recurrence: "weekly",
    recurrence_end_date: hi,
    recurrence_exceptions: [],
    created_at: new Date().toISOString(),
    edited_at: null,
    edited_by_profile_id: null,
  };
}

export type PmScheduleIntent =
  | { kind: "none" }
  | { kind: "need_dates" }
  | { kind: "create"; hours: number }
  | { kind: "overwrite"; hours: number }
  | { kind: "align"; hours: number };

/**
 * Decide whether to create / overwrite / align PM schedule time after a
 * project save. Empty hours skips create/overwrite; date align still possible.
 */
export function resolvePmScheduleIntent(args: {
  /** Parsed daily hours from the form; null when blank. */
  pmDailyHours: number | null;
  managerPersonId: string | null;
  startDate: string | null;
  endDate: string | null;
  existing: Assignment[];
  datesChanged: boolean;
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

  const hasHours =
    pmDailyHours != null && Number.isFinite(pmDailyHours) && pmDailyHours > 0;

  if (hasHours) {
    if (!startDate || !endDate) return { kind: "need_dates" };
    if (existing.length > 0) {
      return { kind: "overwrite", hours: pmDailyHours };
    }
    return { kind: "create", hours: pmDailyHours };
  }

  if (datesChanged && existing.length > 0 && startDate && endDate) {
    const winner = pickPmAssignmentWinner(existing);
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

function isWeekendKey(dateKey: string): boolean {
  const dow = parseISO(dateKey).getDay();
  return dow === 0 || dow === 6;
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
