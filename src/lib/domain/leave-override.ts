import { addDays, addWeeks, isWeekend, parseISO } from "date-fns";
import {
  expandAssignmentInRange,
  occurrenceCoversDay,
} from "@/lib/domain/recurrence";
import { toDateKey, workingDaysBetween } from "@/lib/domain/dates";
import type { Assignment } from "@/lib/types";

export interface LeaveOverrideResult {
  upserts: Assignment[];
  deletes: string[];
}

function prevWorkingDay(dateKey: string): string {
  let d = addDays(parseISO(dateKey), -1);
  while (isWeekend(d)) d = addDays(d, -1);
  return toDateKey(d);
}

function contiguousRanges(days: string[]): { start: string; end: string }[] {
  if (days.length === 0) return [];
  const sorted = [...days].sort();
  const ranges: { start: string; end: string }[] = [];
  let start = sorted[0];
  let end = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const prev = parseISO(end);
    const next = parseISO(sorted[i]);
    // Contiguous working days: next is the next weekday after end
    let cursor = addDays(prev, 1);
    while (isWeekend(cursor)) cursor = addDays(cursor, 1);
    if (toDateKey(cursor) === sorted[i]) {
      end = sorted[i];
    } else {
      ranges.push({ start, end });
      start = sorted[i];
      end = sorted[i];
    }
  }
  ranges.push({ start, end });
  return ranges;
}

function cloneAssignment(
  base: Assignment,
  patch: Partial<Assignment> & { id: string },
): Assignment {
  return {
    ...base,
    ...patch,
    recurrence: patch.recurrence ?? "none",
    recurrence_end_date:
      patch.recurrence_end_date !== undefined
        ? patch.recurrence_end_date
        : patch.recurrence === "weekly"
          ? (base.recurrence_end_date ?? null)
          : null,
  };
}

function punchNonRecurring(
  assignment: Assignment,
  leaveDate: string,
  newId: (prefix: string) => string,
): LeaveOverrideResult {
  const days = workingDaysBetween(assignment.start_date, assignment.end_date);
  if (!days.includes(leaveDate)) {
    return { upserts: [], deletes: [] };
  }
  const remaining = days.filter((d) => d !== leaveDate);
  if (remaining.length === 0) {
    return { upserts: [], deletes: [assignment.id] };
  }
  const ranges = contiguousRanges(remaining);
  const [first, ...rest] = ranges;
  const upserts: Assignment[] = [
    {
      ...assignment,
      start_date: first.start,
      end_date: first.end,
      recurrence: "none",
      recurrence_end_date: null,
    },
  ];
  for (const range of rest) {
    upserts.push(
      cloneAssignment(assignment, {
        id: newId("asg"),
        start_date: range.start,
        end_date: range.end,
        recurrence: "none",
        recurrence_end_date: null,
      }),
    );
  }
  return { upserts, deletes: [] };
}

function punchWeekly(
  assignment: Assignment,
  leaveDate: string,
  newId: (prefix: string) => string,
): LeaveOverrideResult {
  // Expand a window large enough to find the occurrence containing leaveDate.
  const windowStart = toDateKey(addWeeks(parseISO(leaveDate), -1));
  const windowEnd = toDateKey(addWeeks(parseISO(leaveDate), 1));
  const occs = expandAssignmentInRange(assignment, windowStart, windowEnd);
  const occ = occs.find((o) => occurrenceCoversDay(o, leaveDate));
  if (!occ) return { upserts: [], deletes: [] };

  const W = occ.weekOffset;
  const upserts: Assignment[] = [];
  const deletes: string[] = [];

  // Fragments for this week without the leave day.
  const weekDays = workingDaysBetween(occ.start_date, occ.end_date).filter(
    (d) => d !== leaveDate,
  );
  for (const range of contiguousRanges(weekDays)) {
    upserts.push(
      cloneAssignment(assignment, {
        id: newId("asg"),
        start_date: range.start,
        end_date: range.end,
        recurrence: "none",
        recurrence_end_date: null,
      }),
    );
  }

  // Continuation from the following week (same template shape).
  const nextStart = toDateKey(addWeeks(parseISO(assignment.start_date), W + 1));
  const nextEnd = toDateKey(addWeeks(parseISO(assignment.end_date), W + 1));
  const seriesEnd = assignment.recurrence_end_date;
  const canContinue = !seriesEnd || nextStart <= seriesEnd;
  if (canContinue) {
    upserts.push(
      cloneAssignment(assignment, {
        id: newId("asg"),
        start_date: nextStart,
        end_date: nextEnd,
        recurrence: "weekly",
        recurrence_end_date: seriesEnd,
      }),
    );
  }

  if (W === 0) {
    deletes.push(assignment.id);
  } else {
    // End the original series before this occurrence's week.
    const endBefore = prevWorkingDay(occ.start_date);
    upserts.push({
      ...assignment,
      recurrence_end_date: endBefore,
    });
  }

  return { upserts, deletes };
}

/**
 * Full-day leave clears booked time for that person/day by trimming or
 * splitting overlapping assignments (including weekly series).
 */
export function applyFullDayLeaveOverride(
  assignments: Assignment[],
  personId: string,
  leaveDate: string,
  newId: (prefix: string) => string,
): LeaveOverrideResult {
  const upserts: Assignment[] = [];
  const deletes: string[] = [];

  for (const assignment of assignments) {
    if (assignment.person_id !== personId) continue;

    const recurrence = assignment.recurrence ?? "none";
    if (recurrence === "weekly") {
      const result = punchWeekly(assignment, leaveDate, newId);
      upserts.push(...result.upserts);
      deletes.push(...result.deletes);
      continue;
    }

    const days = workingDaysBetween(assignment.start_date, assignment.end_date);
    if (!days.includes(leaveDate)) continue;

    const result = punchNonRecurring(assignment, leaveDate, newId);
    upserts.push(...result.upserts);
    deletes.push(...result.deletes);
  }

  // Prefer delete over upsert for the same id.
  const deleteSet = new Set(deletes);
  return {
    upserts: upserts.filter((a) => !deleteSet.has(a.id)),
    deletes: [...deleteSet],
  };
}

/** Apply override for each date (used when painting a leave range). */
export function applyFullDayLeaveOverrideForDates(
  assignments: Assignment[],
  personId: string,
  leaveDates: string[],
  newId: (prefix: string) => string,
): LeaveOverrideResult {
  let current = [...assignments];
  const allUpserts = new Map<string, Assignment>();
  const allDeletes = new Set<string>();

  for (const date of leaveDates) {
    const { upserts, deletes } = applyFullDayLeaveOverride(
      current,
      personId,
      date,
      newId,
    );
    for (const id of deletes) {
      allDeletes.add(id);
      allUpserts.delete(id);
      current = current.filter((a) => a.id !== id);
    }
    for (const row of upserts) {
      allDeletes.delete(row.id);
      allUpserts.set(row.id, row);
      const idx = current.findIndex((a) => a.id === row.id);
      if (idx >= 0) current[idx] = row;
      else current.push(row);
    }
  }

  return {
    upserts: [...allUpserts.values()],
    deletes: [...allDeletes],
  };
}
