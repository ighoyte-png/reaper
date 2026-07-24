import { addWeeks, differenceInCalendarWeeks, parseISO } from "date-fns";
import type { Assignment } from "@/lib/types";
import {
  toDateKey,
  weekStart,
  workingDaysBetween,
} from "@/lib/domain/dates";

export type Recurrence = "none" | "weekly";

export interface AssignmentOccurrence {
  /** Base assignment id */
  assignmentId: string;
  person_id: string;
  project_id: string;
  start_date: string;
  end_date: string;
  hours_per_day: number;
  status: Assignment["status"];
  notes: string;
  recurrence: Recurrence;
  /** Week offset from the template (0 = original) */
  weekOffset: number;
}

/** Horizon used when summing budget burn for indefinite weekly series. */
export const RECURRENCE_BUDGET_WEEKS = 52;

/** True when a (possibly weekly) assignment can produce days inside [rangeStart, rangeEnd]. */
export function assignmentOverlapsDateRange(
  assignment: Assignment,
  rangeStartKey: string,
  rangeEndKey: string,
): boolean {
  const recurrence = assignment.recurrence ?? "none";
  if (recurrence === "weekly") {
    if (assignment.start_date > rangeEndKey) return false;
    if (
      assignment.recurrence_end_date &&
      assignment.recurrence_end_date < rangeStartKey
    ) {
      return false;
    }
    return true;
  }
  return (
    assignment.start_date <= rangeEndKey &&
    assignment.end_date >= rangeStartKey
  );
}

export function expandAssignmentInRange(
  assignment: Assignment,
  rangeStartKey: string,
  rangeEndKey: string,
): AssignmentOccurrence[] {
  const recurrence = assignment.recurrence ?? "none";
  if (recurrence !== "weekly") {
    if (
      assignment.end_date < rangeStartKey ||
      assignment.start_date > rangeEndKey
    ) {
      return [];
    }
    return [
      {
        assignmentId: assignment.id,
        person_id: assignment.person_id,
        project_id: assignment.project_id,
        start_date: assignment.start_date,
        end_date: assignment.end_date,
        hours_per_day: assignment.hours_per_day,
        status: assignment.status,
        notes: assignment.notes,
        recurrence,
        weekOffset: 0,
      },
    ];
  }

  const templateStart = parseISO(assignment.start_date);
  const templateEnd = parseISO(assignment.end_date);
  const templateWeek = weekStart(templateStart);
  const rangeStart = parseISO(rangeStartKey);
  const rangeEnd = parseISO(rangeEndKey);
  const viewWeekStart = weekStart(rangeStart);
  const viewWeekEnd = weekStart(rangeEnd);
  const seriesEndKey = assignment.recurrence_end_date ?? null;
  const exceptions = new Set(assignment.recurrence_exceptions ?? []);

  const firstOffset = Math.max(
    0,
    differenceInCalendarWeeks(viewWeekStart, templateWeek, { weekStartsOn: 1 }),
  );
  let lastOffset = differenceInCalendarWeeks(viewWeekEnd, templateWeek, {
    weekStartsOn: 1,
  });
  // Indefinite weekly series are budgeted for at most 52 weeks — never walk
  // multi-decade ranges like budgetBurn's 1970–2099 window.
  const maxSeriesOffset = seriesEndKey
    ? differenceInCalendarWeeks(
        weekStart(parseISO(seriesEndKey)),
        templateWeek,
        { weekStartsOn: 1 },
      )
    : RECURRENCE_BUDGET_WEEKS - 1;
  lastOffset = Math.min(lastOffset, Math.max(0, maxSeriesOffset));

  const out: AssignmentOccurrence[] = [];
  for (let offset = firstOffset; offset <= lastOffset; offset++) {
    if (offset < 0) continue;
    const start = addWeeks(templateStart, offset);
    const end = addWeeks(templateEnd, offset);
    const startKey = toDateKey(start);
    const endKey = toDateKey(end);
    if (seriesEndKey && startKey > seriesEndKey) break;
    const weekKey = toDateKey(weekStart(start));
    if (exceptions.has(weekKey)) continue;
    if (endKey < rangeStartKey || startKey > rangeEndKey) continue;
    out.push({
      assignmentId: assignment.id,
      person_id: assignment.person_id,
      project_id: assignment.project_id,
      start_date: startKey,
      end_date: seriesEndKey && endKey > seriesEndKey ? seriesEndKey : endKey,
      hours_per_day: assignment.hours_per_day,
      status: assignment.status,
      notes: assignment.notes,
      recurrence,
      weekOffset: offset,
    });
  }
  return out;
}

export function expandAssignmentsInRange(
  assignments: Assignment[],
  rangeStartKey: string,
  rangeEndKey: string,
): AssignmentOccurrence[] {
  return assignments.flatMap((a) =>
    expandAssignmentInRange(a, rangeStartKey, rangeEndKey),
  );
}

function weeksInSeries(assignment: Assignment): number {
  const end = assignment.recurrence_end_date;
  if (!end) return RECURRENCE_BUDGET_WEEKS;
  const templateWeek = weekStart(parseISO(assignment.start_date));
  const endWeek = weekStart(parseISO(end));
  const weeks =
    differenceInCalendarWeeks(endWeek, templateWeek, { weekStartsOn: 1 }) + 1;
  return Math.max(1, Math.min(RECURRENCE_BUDGET_WEEKS, weeks));
}

function exceptionWeeksInSeries(assignment: Assignment): number {
  const exceptions = assignment.recurrence_exceptions ?? [];
  if (exceptions.length === 0) return 0;
  const templateWeek = weekStart(parseISO(assignment.start_date));
  const maxOffset = weeksInSeries(assignment) - 1;
  const seriesEndKey = assignment.recurrence_end_date;
  let count = 0;
  for (const key of exceptions) {
    const week = weekStart(parseISO(key));
    const offset = differenceInCalendarWeeks(week, templateWeek, {
      weekStartsOn: 1,
    });
    if (offset < 0 || offset > maxOffset) continue;
    if (seriesEndKey && key > seriesEndKey) continue;
    count += 1;
  }
  return count;
}

/** Hours for budget: non-recurring as stored; weekly counted through end or 52 weeks. */
export function assignmentHoursWithRecurrence(assignment: Assignment): number {
  const recurrence = assignment.recurrence ?? "none";
  const one =
    workingDaysBetween(assignment.start_date, assignment.end_date).length *
    assignment.hours_per_day;
  if (recurrence !== "weekly") return one;
  const weeks = Math.max(
    0,
    weeksInSeries(assignment) - exceptionWeeksInSeries(assignment),
  );
  return one * weeks;
}

export function occurrenceCoversDay(
  occ: AssignmentOccurrence,
  dateKey: string,
): boolean {
  return (
    dateKey >= occ.start_date &&
    dateKey <= occ.end_date &&
    workingDaysBetween(occ.start_date, occ.end_date).includes(dateKey)
  );
}
