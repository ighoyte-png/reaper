import type { Assignment, LeaveDay } from "@/lib/types";
import { workingDaysBetween } from "@/lib/domain/dates";
import { isOnFullDayLeave } from "@/lib/domain/capacity";
import {
  expandAssignmentInRange,
  expandAssignmentsInRange,
  occurrenceCoversDay,
} from "@/lib/domain/recurrence";
import { punchAssignmentOnDate } from "@/lib/domain/leave-override";

export type ClampResizeResult = { value: string; leaveTrimmed: boolean };

function mergeFullDayLeaveIntoOccupied(
  personId: string,
  rangeStart: string,
  rangeEnd: string,
  occupied: Set<string>,
  leaveDays?: LeaveDay[],
): void {
  if (!leaveDays?.length) return;
  for (const day of workingDaysBetween(rangeStart, rangeEnd)) {
    if (isOnFullDayLeave(personId, day, leaveDays)) occupied.add(day);
  }
}

function leaveBlockedBetween(
  personId: string,
  fromExclusive: string,
  toInclusive: string,
  leaveDays?: LeaveDay[],
): boolean {
  if (!leaveDays?.length || toInclusive <= fromExclusive) return false;
  for (const day of workingDaysBetween(fromExclusive, toInclusive)) {
    if (day > fromExclusive && isOnFullDayLeave(personId, day, leaveDays)) {
      return true;
    }
  }
  return false;
}

/**
 * True when `candidate` would share any working day with another assignment
 * on the same person + project row (within the check window).
 */
export function assignmentPlacementConflicts(
  candidate: Assignment,
  assignments: Assignment[],
  rangeStart: string,
  rangeEnd: string,
): boolean {
  const others = assignments.filter(
    (a) =>
      a.id !== candidate.id &&
      a.person_id === candidate.person_id &&
      a.project_id === candidate.project_id,
  );
  if (others.length === 0) return false;

  const mine = expandAssignmentInRange(candidate, rangeStart, rangeEnd);
  if (mine.length === 0) return false;
  const otherOccs = expandAssignmentsInRange(others, rangeStart, rangeEnd);
  if (otherOccs.length === 0) return false;

  for (const occ of mine) {
    for (const day of workingDaysBetween(occ.start_date, occ.end_date)) {
      if (otherOccs.some((o) => occurrenceCoversDay(o, day))) return true;
    }
  }
  return false;
}

/** Working days on this person+project row already taken by other assignments. */
export function occupiedDaysForRow(
  personId: string,
  projectId: string,
  rangeStart: string,
  rangeEnd: string,
  assignments: Assignment[],
  excludeAssignmentId?: string | null,
): Set<string> {
  const others = assignments.filter(
    (a) =>
      a.person_id === personId &&
      a.project_id === projectId &&
      a.id !== excludeAssignmentId,
  );
  const occs = expandAssignmentsInRange(others, rangeStart, rangeEnd);
  const days = new Set<string>();
  for (const occ of occs) {
    for (const day of workingDaysBetween(occ.start_date, occ.end_date)) {
      if (day >= rangeStart && day <= rangeEnd) days.add(day);
    }
  }
  return days;
}

/**
 * Clip a painted/created range to free working days contiguous with the
 * origin. Returns null if the origin cell is already occupied.
 */
export function clipRangeToFreeDays(
  personId: string,
  projectId: string,
  originDay: string,
  rangeStart: string,
  rangeEnd: string,
  assignments: Assignment[],
  excludeAssignmentId?: string | null,
  leaveDays?: LeaveDay[],
): { start: string; end: string; leaveTrimmed: boolean } | null {
  const lo = rangeStart <= rangeEnd ? rangeStart : rangeEnd;
  const hi = rangeStart <= rangeEnd ? rangeEnd : rangeStart;
  const days = workingDaysBetween(lo, hi);
  if (days.length === 0) return null;

  const occupied = occupiedDaysForRow(
    personId,
    projectId,
    lo,
    hi,
    assignments,
    excludeAssignmentId,
  );
  mergeFullDayLeaveIntoOccupied(personId, lo, hi, occupied, leaveDays);
  if (occupied.has(originDay) || !days.includes(originDay)) return null;

  const originIndex = days.indexOf(originDay);
  let startIdx = originIndex;
  let endIdx = originIndex;
  while (startIdx > 0 && !occupied.has(days[startIdx - 1])) startIdx -= 1;
  while (endIdx < days.length - 1 && !occupied.has(days[endIdx + 1])) {
    endIdx += 1;
  }
  const start = days[startIdx];
  const end = days[endIdx];
  const leaveTrimmed =
    leaveBlockedBetween(personId, end, hi, leaveDays) ||
    leaveBlockedBetween(personId, lo, start, leaveDays);
  return { start, end, leaveTrimmed };
}

/**
 * Clamp resize-end so the span never expands into an occupied day.
 * `desiredEnd` may be before start (ignored → start).
 */
export function clampResizeEnd(
  personId: string,
  projectId: string,
  start: string,
  desiredEnd: string,
  assignments: Assignment[],
  excludeAssignmentId: string,
  leaveDays?: LeaveDay[],
): ClampResizeResult {
  if (desiredEnd < start) {
    return { value: start, leaveTrimmed: false };
  }
  const occupied = occupiedDaysForRow(
    personId,
    projectId,
    start,
    desiredEnd,
    assignments,
    excludeAssignmentId,
  );
  mergeFullDayLeaveIntoOccupied(
    personId,
    start,
    desiredEnd,
    occupied,
    leaveDays,
  );
  const days = workingDaysBetween(start, desiredEnd);
  let end = start;
  for (const day of days) {
    if (day === start) {
      end = day;
      continue;
    }
    if (occupied.has(day)) break;
    end = day;
  }
  return {
    value: end,
    leaveTrimmed: leaveBlockedBetween(personId, end, desiredEnd, leaveDays),
  };
}

/**
 * Clamp resize-start so the span never expands into an occupied day.
 */
export function clampResizeStart(
  personId: string,
  projectId: string,
  desiredStart: string,
  end: string,
  assignments: Assignment[],
  excludeAssignmentId: string,
  leaveDays?: LeaveDay[],
): ClampResizeResult {
  if (desiredStart > end) {
    return { value: end, leaveTrimmed: false };
  }
  const occupied = occupiedDaysForRow(
    personId,
    projectId,
    desiredStart,
    end,
    assignments,
    excludeAssignmentId,
  );
  mergeFullDayLeaveIntoOccupied(
    personId,
    desiredStart,
    end,
    occupied,
    leaveDays,
  );
  const days = workingDaysBetween(desiredStart, end);
  let start = end;
  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i];
    if (day === end) {
      start = day;
      continue;
    }
    if (occupied.has(day)) break;
    start = day;
  }
  return {
    value: start,
    leaveTrimmed: leaveBlockedBetween(personId, desiredStart, start, leaveDays),
  };
}

function assignmentSpanDays(a: Assignment): number {
  return workingDaysBetween(a.start_date, a.end_date).length;
}

/**
 * Punch holes in same person+project row assignments for each working day in
 * the insert range (same model as leave on weekly PM blocks).
 */
export function punchProjectRowForInsertRange(
  assignments: Assignment[],
  personId: string,
  projectId: string,
  rangeStart: string,
  rangeEnd: string,
  newId: (prefix: string) => string,
): { upserts: Assignment[]; deletes: string[] } {
  const days = workingDaysBetween(rangeStart, rangeEnd);
  let current = [...assignments];
  const allUpserts = new Map<string, Assignment>();
  const allDeletes = new Set<string>();

  for (const day of days) {
    const rowAssignments = current.filter(
      (a) =>
        a.person_id === personId &&
        a.project_id === projectId &&
        !allDeletes.has(a.id),
    );
    for (const assignment of rowAssignments) {
      const occs = expandAssignmentInRange(assignment, day, day);
      if (!occs.some((o) => occurrenceCoversDay(o, day))) continue;
      const result = punchAssignmentOnDate(assignment, day, newId);
      for (const id of result.deletes) {
        allDeletes.add(id);
        allUpserts.delete(id);
        current = current.filter((a) => a.id !== id);
      }
      for (const row of result.upserts) {
        allDeletes.delete(row.id);
        allUpserts.set(row.id, row);
        const idx = current.findIndex((a) => a.id === row.id);
        if (idx >= 0) current[idx] = row;
        else current.push(row);
      }
    }
  }

  const deleteSet = new Set(allDeletes);
  return {
    upserts: [...allUpserts.values()].filter((a) => !deleteSet.has(a.id)),
    deletes: [...deleteSet],
  };
}

/**
 * Remove same-person + same-project day overlaps in `range`. Keeps the
 * longer contiguous span (then stable id); punches/deletes underlappers.
 */
export function cleanupOverlappingAssignments(
  assignments: Assignment[],
  rangeStart: string,
  rangeEnd: string,
  newId: (prefix: string) => string,
): { upserts: Assignment[]; deletes: string[] } {
  const groups = new Map<string, Assignment[]>();
  for (const a of assignments) {
    const key = `${a.person_id}|${a.project_id}`;
    const list = groups.get(key);
    if (list) list.push(a);
    else groups.set(key, [a]);
  }

  let current = [...assignments];
  const allUpserts = new Map<string, Assignment>();
  const allDeletes = new Set<string>();

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    // Longer span wins, then stable id.
    const ranked = [...group].sort((a, b) => {
      const spanDiff = assignmentSpanDays(b) - assignmentSpanDays(a);
      if (spanDiff !== 0) return spanDiff;
      return a.id.localeCompare(b.id);
    });

    const claimed = new Set<string>();
    const lineage = new Map<string, Set<string>>();
    for (const root of ranked) {
      lineage.set(root.id, new Set([root.id]));
    }

    for (const root of ranked) {
      const liveIds = lineage.get(root.id);
      if (!liveIds || liveIds.size === 0) continue;

      const conflictDays = new Set<string>();
      for (const id of [...liveIds]) {
        const live = current.find((a) => a.id === id);
        if (!live || allDeletes.has(id)) continue;
        const occs = expandAssignmentInRange(live, rangeStart, rangeEnd);
        for (const occ of occs) {
          for (const day of workingDaysBetween(occ.start_date, occ.end_date)) {
            if (day < rangeStart || day > rangeEnd) continue;
            if (claimed.has(day)) conflictDays.add(day);
          }
        }
      }

      if (conflictDays.size > 0) {
        for (const day of [...conflictDays].sort()) {
          const pieces = current.filter(
            (a) => liveIds.has(a.id) && !allDeletes.has(a.id),
          );
          for (const piece of pieces) {
            const occs = expandAssignmentInRange(piece, day, day);
            if (!occs.some((o) => occurrenceCoversDay(o, day))) continue;
            const result = punchAssignmentOnDate(piece, day, newId);
            for (const id of result.deletes) {
              allDeletes.add(id);
              allUpserts.delete(id);
              liveIds.delete(id);
              current = current.filter((a) => a.id !== id);
            }
            for (const row of result.upserts) {
              allDeletes.delete(row.id);
              allUpserts.set(row.id, row);
              liveIds.add(row.id);
              const idx = current.findIndex((a) => a.id === row.id);
              if (idx >= 0) current[idx] = row;
              else current.push(row);
            }
          }
        }
      }

      for (const id of liveIds) {
        const live = current.find((a) => a.id === id);
        if (!live || allDeletes.has(id)) continue;
        const occs = expandAssignmentInRange(live, rangeStart, rangeEnd);
        for (const occ of occs) {
          for (const day of workingDaysBetween(occ.start_date, occ.end_date)) {
            if (day >= rangeStart && day <= rangeEnd) claimed.add(day);
          }
        }
      }
    }
  }

  return {
    upserts: [...allUpserts.values()].filter((a) => !allDeletes.has(a.id)),
    deletes: [...allDeletes],
  };
}
