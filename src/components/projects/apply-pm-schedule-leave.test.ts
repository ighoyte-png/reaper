import { describe, expect, it } from "vitest";
import { applyProjectManagerScheduleTime } from "@/components/projects/apply-pm-schedule";
import { expandAssignmentInRange } from "@/lib/domain/recurrence";
import { workingDaysBetween } from "@/lib/domain/dates";
import type { Assignment, AssignmentBoundTask, LeaveDay } from "@/lib/types";

function assignment(partial: Partial<Assignment> & { id: string }): Assignment {
  return {
    organization_id: "org",
    person_id: "pm-1",
    project_id: "proj-1",
    start_date: "2026-08-03",
    end_date: "2026-08-07",
    hours_per_day: 2,
    allocation_pct: null,
    status: "confirmed",
    notes: "Project management",
    recurrence: "weekly",
    recurrence_end_date: "2026-08-28",
    recurrence_exceptions: [],
    created_at: "2026-01-01T00:00:00.000Z",
    edited_at: null,
    edited_by_profile_id: null,
    ...partial,
  };
}

function bookedDays(
  rows: Iterable<Assignment>,
  lo: string,
  hi: string,
): Set<string> {
  const booked = new Set<string>();
  for (const a of rows) {
    for (const occ of expandAssignmentInRange(a, lo, hi)) {
      for (const day of workingDaysBetween(occ.start_date, occ.end_date)) {
        if (day >= lo && day <= hi) booked.add(day);
      }
    }
  }
  return booked;
}

describe("applyProjectManagerScheduleTime leave overwrite", () => {
  it("punches mid-timeline full-day leave out of the rebuilt series", async () => {
    const byId = new Map<string, Assignment>();
    const deleted: string[] = [];
    let n = 0;
    const leaveDays: LeaveDay[] = [
      {
        id: "lv1",
        organization_id: "org",
        person_id: "pm-1",
        date: "2026-08-12",
        kind: "vacation",
        hours_per_day: null,
        status: "approved",
        notes: "",
      },
    ];

    const result = await applyProjectManagerScheduleTime({
      organizationId: "org",
      projectId: "proj-1",
      managerPersonId: "pm-1",
      startDate: "2026-08-03",
      endDate: "2026-08-28",
      hoursPerDay: 3,
      assignments: [assignment({ id: "pm-old" })],
      leaveDays,
      newId: (prefix) => `${prefix}-${++n}`,
      upsertAssignment: (a) => {
        byId.set(a.id, a);
      },
      deleteAssignment: (id) => {
        deleted.push(id);
        byId.delete(id);
      },
    });

    expect(result.created).toBe(true);
    expect(result.leaveTrimmed).toBe(true);
    expect(deleted).toContain("pm-old");
    const booked = bookedDays(byId.values(), "2026-08-03", "2026-08-28");
    expect(booked.has("2026-08-12")).toBe(false);
    expect(booked.size).toBeGreaterThan(0);
  });

  it("keeps protected bound rows when leave and protected days both punch", async () => {
    const byId = new Map<string, Assignment>();
    const deleted: string[] = [];
    let n = 0;
    const leaveDays: LeaveDay[] = [
      {
        id: "lv1",
        organization_id: "org",
        person_id: "pm-1",
        date: "2026-08-19",
        kind: "holiday",
        hours_per_day: null,
        status: "approved",
        notes: "Holiday",
      },
    ];
    const boundTasks: AssignmentBoundTask[] = [
      {
        assignment_id: "prod",
        task_id: "task-1",
        organization_id: "org",
        sort_order: 0,
        bound_source: "schedule",
        out_of_sync: false,
      },
    ];
    const prod = assignment({
      id: "prod",
      notes: "<!--reaper-bound-tasks--><p>Design</p>",
      hours_per_day: 6,
      start_date: "2026-08-10",
      end_date: "2026-08-11",
      recurrence: "none",
      recurrence_end_date: null,
    });
    byId.set("prod", prod);

    await applyProjectManagerScheduleTime({
      organizationId: "org",
      projectId: "proj-1",
      managerPersonId: "pm-1",
      startDate: "2026-08-03",
      endDate: "2026-08-28",
      hoursPerDay: 3,
      assignments: [assignment({ id: "pm-old" }), prod],
      leaveDays,
      assignmentBoundTasks: boundTasks,
      newId: (prefix) => `${prefix}-${++n}`,
      upsertAssignment: (a) => {
        byId.set(a.id, a);
      },
      deleteAssignment: (id) => {
        deleted.push(id);
        byId.delete(id);
      },
    });

    expect(deleted).not.toContain("prod");
    expect(byId.has("prod")).toBe(true);
    const booked = bookedDays(byId.values(), "2026-08-03", "2026-08-28");
    // New series must not cover protected or leave days
    expect(booked.has("2026-08-19")).toBe(false);
    // Protected assignment still books its own days
    expect(booked.has("2026-08-10")).toBe(true);
    expect(booked.has("2026-08-11")).toBe(true);
    // But those days should only come from prod, not new PM hours —
    // verify new rows don't include them
    const newOnly = bookedDays(
      [...byId.values()].filter((a) => a.id !== "prod"),
      "2026-08-03",
      "2026-08-28",
    );
    expect(newOnly.has("2026-08-10")).toBe(false);
    expect(newOnly.has("2026-08-11")).toBe(false);
  });
});
