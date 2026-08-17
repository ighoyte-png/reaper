import { addWeeks, addYears, differenceInCalendarWeeks, parseISO } from "date-fns";
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

/**
 * Last date a weekly series may run.
 * Explicit series end is kept (clamped to project end); otherwise project
 * end; otherwise 12 months after the assignment start.
 */
export function weeklySeriesEndDate(
  assignment: Pick<
    Assignment,
    "start_date" | "recurrence" | "recurrence_end_date"
  >,
  projectEndDate?: string | null,
): string {
  const projectEnd = projectEndDate?.trim() || null;
  const explicit = assignment.recurrence_end_date?.trim() || null;
  if (explicit) {
    if (projectEnd && explicit > projectEnd) return projectEnd;
    return explicit;
  }
  if (projectEnd) return projectEnd;
  return toDateKey(addYears(parseISO(assignment.start_date), 1));
}

/** True when a (possibly weekly) assignment can produce days inside [rangeStart, rangeEnd]. */
export function assignmentOverlapsDateRange(
  assignment: Assignment,
  rangeStartKey: string,
  rangeEndKey: string,
  projectEndDate?: string | null,
): boolean {
  const recurrence = assignment.recurrence ?? "none";
  if (recurrence === "weekly") {
    if (assignment.start_date > rangeEndKey) return false;
    const seriesEnd = weeklySeriesEndDate(assignment, projectEndDate);
    if (seriesEnd < rangeStartKey) return false;
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
  projectEndDate?: string | null,
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
  const seriesEndKey = weeklySeriesEndDate(assignment, projectEndDate);
  const exceptions = new Set(assignment.recurrence_exceptions ?? []);

  const firstOffset = Math.max(
    0,
    differenceInCalendarWeeks(viewWeekStart, templateWeek, { weekStartsOn: 1 }),
  );
  let lastOffset = differenceInCalendarWeeks(viewWeekEnd, templateWeek, {
    weekStartsOn: 1,
  });
  const maxSeriesOffset = differenceInCalendarWeeks(
    weekStart(parseISO(seriesEndKey)),
    templateWeek,
    { weekStartsOn: 1 },
  );
  lastOffset = Math.min(lastOffset, Math.max(0, maxSeriesOffset));

  const out: AssignmentOccurrence[] = [];
  for (let offset = firstOffset; offset <= lastOffset; offset++) {
    if (offset < 0) continue;
    const start = addWeeks(templateStart, offset);
    const end = addWeeks(templateEnd, offset);
    const startKey = toDateKey(start);
    const endKey = toDateKey(end);
    if (startKey > seriesEndKey) break;
    const weekKey = toDateKey(weekStart(start));
    if (exceptions.has(weekKey)) continue;
    if (endKey < rangeStartKey || startKey > rangeEndKey) continue;
    out.push({
      assignmentId: assignment.id,
      person_id: assignment.person_id,
      project_id: assignment.project_id,
      start_date: startKey,
      end_date: endKey > seriesEndKey ? seriesEndKey : endKey,
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
  projectEndFor?: (projectId: string) => string | null | undefined,
): AssignmentOccurrence[] {
  return assignments.flatMap((a) =>
    expandAssignmentInRange(
      a,
      rangeStartKey,
      rangeEndKey,
      projectEndFor?.(a.project_id),
    ),
  );
}

function weeksInSeries(
  assignment: Assignment,
  projectEndDate?: string | null,
): number {
  const end = weeklySeriesEndDate(assignment, projectEndDate);
  const templateWeek = weekStart(parseISO(assignment.start_date));
  const endWeek = weekStart(parseISO(end));
  const weeks =
    differenceInCalendarWeeks(endWeek, templateWeek, { weekStartsOn: 1 }) + 1;
  return Math.max(1, weeks);
}

function exceptionWeeksInSeries(
  assignment: Assignment,
  projectEndDate?: string | null,
): number {
  const exceptions = assignment.recurrence_exceptions ?? [];
  if (exceptions.length === 0) return 0;
  const templateWeek = weekStart(parseISO(assignment.start_date));
  const maxOffset = weeksInSeries(assignment, projectEndDate) - 1;
  const seriesEndKey = weeklySeriesEndDate(assignment, projectEndDate);
  let count = 0;
  for (const key of exceptions) {
    const week = weekStart(parseISO(key));
    const offset = differenceInCalendarWeeks(week, templateWeek, {
      weekStartsOn: 1,
    });
    if (offset < 0 || offset > maxOffset) continue;
    if (key > seriesEndKey) continue;
    count += 1;
  }
  return count;
}

/** Hours for budget: non-recurring as stored; weekly counted through series end. */
export function assignmentHoursWithRecurrence(
  assignment: Assignment,
  projectEndDate?: string | null,
): number {
  const recurrence = assignment.recurrence ?? "none";
  const one =
    workingDaysBetween(assignment.start_date, assignment.end_date).length *
    assignment.hours_per_day;
  if (recurrence !== "weekly") return one;
  const weeks = Math.max(
    0,
    weeksInSeries(assignment, projectEndDate) -
      exceptionWeeksInSeries(assignment, projectEndDate),
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
