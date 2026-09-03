import { punchAssignmentsForFullDayDates } from "@/lib/domain/leave-override";
import { isFullDayLeave } from "@/lib/domain/leave";
import {
  buildPmScheduleAssignments,
  findPmProjectAssignments,
  fullDayLeaveDatesInRange,
  holidayCalendarDatesInRange,
  partitionPmProjectAssignments,
  protectedPmAssignmentIds,
  protectedPmOccurrenceDates,
  snapPmTimelineToScheduleDays,
} from "@/lib/domain/project-manager-schedule";
import type {
  Assignment,
  AssignmentBoundTask,
  HolidayCalendarDay,
  LeaveDay,
  Person,
} from "@/lib/types";

/**
 * Replace unprotected PM+project assignments with a weekly series for the
 * project timeline. Assignments with bound tasks (or bound-task notes) are
 * never deleted. Full-day leave, holiday calendar days, and protected
 * occurrence days are punched out of the new series before any persist so
 * remote never sees an unpunched weekly that overlaps protected time.
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
  /** Manager person (for holiday calendar). */
  managerPerson?: Pick<Person, "holiday_calendar_id"> | null;
  holidayCalendarDays?: HolidayCalendarDay[];
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
  const holidayDates = holidayCalendarDatesInRange(
    args.managerPerson,
    args.holidayCalendarDays ?? [],
    lo,
    hi,
  );
  const offDates = [...new Set([...leaveDates, ...holidayDates])].sort();
  const snapped = snapPmTimelineToScheduleDays(lo, hi, offDates);
  if (!snapped) {
    return { created: false, reason: "No working days in that timeline" };
  }

  const existing = findPmProjectAssignments(
    assignments,
    args.managerPersonId,
    args.projectId,
  );
  const protectedIds = protectedPmAssignmentIds(
    existing,
    args.assignmentBoundTasks ?? [],
  );
  const { protected: protectedRows, replaceable } =
    partitionPmProjectAssignments(existing, protectedIds);
  const protectedDates = protectedPmOccurrenceDates(
    protectedRows,
    snapped.start,
    snapped.end,
  );

  const built = buildPmScheduleAssignments({
    newId: () => args.newId("asg"),
    organizationId: args.organizationId,
    personId: args.managerPersonId,
    projectId: args.projectId,
    startDate: snapped.start,
    endDate: snapped.end,
    hoursPerDay: args.hoursPerDay,
  });
  if (built.length === 0) {
    return { created: false, reason: "No working days in that timeline" };
  }

  const punchDates = [...new Set([...offDates, ...protectedDates])].sort();
  const finalRows =
    punchDates.length === 0
      ? built
      : punchAssignmentsForFullDayDates(
          built,
          args.managerPersonId,
          punchDates,
          args.newId,
        );

  if (finalRows.length === 0) {
    return {
      created: false,
      reason: "No schedule days left after time off and protected tasks",
    };
  }

  // Persist only the final punched set — never write the unpunched weekly.
  for (const a of replaceable) {
    if (protectedIds.has(a.id)) continue;
    args.deleteAssignment(a.id);
  }
  for (const row of finalRows) {
    args.upsertAssignment(row);
  }

  return {
    created: true,
    leaveTrimmed: punchDates.length > 0,
  };
}
