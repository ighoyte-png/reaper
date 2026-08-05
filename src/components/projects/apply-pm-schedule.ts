import { applyFullDayLeaveOverrideForDates } from "@/lib/domain/leave-override";
import { isFullDayLeave } from "@/lib/domain/leave";
import {
  buildPmScheduleAssignments,
  findPmProjectAssignments,
  fullDayLeaveDatesInRange,
} from "@/lib/domain/project-manager-schedule";
import type { Assignment, LeaveDay } from "@/lib/types";

/**
 * Replace PM+project assignments with a weekly series for the project
 * timeline, then punch full-day leave holes out of that series.
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

  const rows = buildPmScheduleAssignments({
    newId: () => args.newId("asg"),
    organizationId: args.organizationId,
    personId: args.managerPersonId,
    projectId: args.projectId,
    startDate: lo,
    endDate: hi,
    hoursPerDay: args.hoursPerDay,
  });
  if (rows.length === 0) {
    return { created: false, reason: "No working days in that timeline" };
  }

  const existing = findPmProjectAssignments(
    assignments,
    args.managerPersonId,
    args.projectId,
  );
  for (const a of existing) {
    args.deleteAssignment(a.id);
  }

  for (const row of rows) {
    args.upsertAssignment(row);
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
  if (leaveDates.length === 0) return { created: true, leaveTrimmed: false };

  const { upserts, deletes } = applyFullDayLeaveOverrideForDates(
    rows,
    args.managerPersonId,
    leaveDates,
    args.newId,
  );
  for (const id of deletes) {
    args.deleteAssignment(id);
  }
  for (const row of upserts) {
    args.upsertAssignment(row);
  }
  return { created: true, leaveTrimmed: true };
}
