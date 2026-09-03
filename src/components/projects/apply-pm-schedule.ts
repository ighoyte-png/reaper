import { applyFullDayLeaveOverrideForDates } from "@/lib/domain/leave-override";
import { isFullDayLeave } from "@/lib/domain/leave";
import {
  assignmentIdsWithBoundTasks,
  buildPmScheduleAssignments,
  findPmProjectAssignments,
  fullDayLeaveDatesInRange,
  partitionPmProjectAssignments,
  protectedPmOccurrenceDates,
  snapPmTimelineToScheduleDays,
} from "@/lib/domain/project-manager-schedule";
import type { Assignment, AssignmentBoundTask, LeaveDay } from "@/lib/types";

/**
 * Replace unprotected PM+project assignments with a weekly series for the
 * project timeline. Assignments with bound tasks are never deleted. Full-day
 * leave and protected occurrence days are punched out of the new series.
 */
export async function applyProjectManagerScheduleTime(args: {
  organizationId: string;
  projectId: string;
  managerPersonId: string;
  startDate: string;
  endDate: string;
  hoursPerDay: number;
  assignments: Assignment[];
  leaveDays: LeaveDay[];
  assignmentBoundTasks?: AssignmentBoundTask[];
  newId: (prefix: string) => string;
  upsertAssignment: (a: Assignment) => void;
  deleteAssignment: (id: string) => void;
  ensureScheduleRange?: (
    startKey: string,
    endKey: string,
  ) => Promise<
    { leaveDays: LeaveDay[]; assignments: Assignment[] } | void
  >;
}): Promise<{ created: boolean; reason?: string; leaveTrimmed?: boolean }> {
  const lo =
    args.startDate <= args.endDate ? args.startDate : args.endDate;
  const hi =
    args.startDate <= args.endDate ? args.endDate : args.startDate;

  let leaveDays = args.leaveDays;
  let assignments = args.assignments;
  if (args.ensureScheduleRange) {
    const loaded = await args.ensureScheduleRange(lo, hi);
    if (loaded?.leaveDays) {
      const byId = new Map(leaveDays.map((l) => [l.id, l]));
      for (const l of loaded.leaveDays) byId.set(l.id, l);
      leaveDays = [...byId.values()];
    }
    if (loaded?.assignments) {
      const byId = new Map(assignments.map((a) => [a.id, a]));
      for (const a of loaded.assignments) byId.set(a.id, a);
      assignments = [...byId.values()];
    }
  }

  const leaveDates = fullDayLeaveDatesInRange(
    leaveDays,
    args.managerPersonId,
    lo,
    hi,
    (leave) =>
      isFullDayLeave({
        kind: leave.kind as LeaveDay["kind"],
        hours_per_day: leave.hours_per_day,
      }),
  );
  const snapped = snapPmTimelineToScheduleDays(lo, hi, leaveDates);
  if (!snapped) {
    return { created: false, reason: "No working days in that timeline" };
  }

  const existing = findPmProjectAssignments(
    assignments,
    args.managerPersonId,
    args.projectId,
  );
  const protectedIds = assignmentIdsWithBoundTasks(
    args.assignmentBoundTasks ?? [],
  );
  const { protected: protectedRows, replaceable } =
    partitionPmProjectAssignments(existing, protectedIds);
  const protectedDates = protectedPmOccurrenceDates(
    protectedRows,
    snapped.start,
    snapped.end,
  );

  const rows = buildPmScheduleAssignments({
    newId: () => args.newId("asg"),
    organizationId: args.organizationId,
    personId: args.managerPersonId,
    projectId: args.projectId,
    startDate: snapped.start,
    endDate: snapped.end,
    hoursPerDay: args.hoursPerDay,
  });
  if (rows.length === 0) {
    return { created: false, reason: "No working days in that timeline" };
  }

  for (const a of replaceable) {
    args.deleteAssignment(a.id);
  }

  for (const row of rows) {
    args.upsertAssignment(row);
  }

  const punchDates = [...new Set([...leaveDates, ...protectedDates])].sort();
  if (punchDates.length === 0) return { created: true, leaveTrimmed: false };

  const { upserts, deletes } = applyFullDayLeaveOverrideForDates(
    rows,
    args.managerPersonId,
    punchDates,
    args.newId,
  );
  for (const id of deletes) {
    // Never touch protected assignment ids (punch only targets newly built rows).
    if (protectedIds.has(id)) continue;
    args.deleteAssignment(id);
  }
  for (const row of upserts) {
    args.upsertAssignment(row);
  }
  return { created: true, leaveTrimmed: true };
}
