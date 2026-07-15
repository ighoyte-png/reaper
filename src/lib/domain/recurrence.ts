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

  const firstOffset = Math.max(
    0,
    differenceInCalendarWeeks(viewWeekStart, templateWeek, { weekStartsOn: 1 }),
  );
  const lastOffset = differenceInCalendarWeeks(viewWeekEnd, templateWeek, {
    weekStartsOn: 1,
  });

  const out: AssignmentOccurrence[] = [];
  for (let offset = firstOffset; offset <= lastOffset; offset++) {
    if (offset < 0) continue;
    const start = addWeeks(templateStart, offset);
    const end = addWeeks(templateEnd, offset);
    const startKey = toDateKey(start);
    const endKey = toDateKey(end);
    if (endKey < rangeStartKey || startKey > rangeEndKey) continue;
    out.push({
      assignmentId: assignment.id,
      person_id: assignment.person_id,
      project_id: assignment.project_id,
      start_date: startKey,
      end_date: endKey,
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

/** Hours for budget: non-recurring as stored; weekly counted for N weeks ahead. */
export function assignmentHoursWithRecurrence(assignment: Assignment): number {
  const recurrence = assignment.recurrence ?? "none";
  const one = workingDaysBetween(
    assignment.start_date,
    assignment.end_date,
  ).length * assignment.hours_per_day;
  if (recurrence !== "weekly") return one;
  return one * RECURRENCE_BUDGET_WEEKS;
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
