import { describe, expect, it, vi } from "vitest";
import { applyProjectManagerScheduleTime } from "@/components/projects/apply-pm-schedule";
import { expandAssignmentInRange } from "@/lib/domain/recurrence";
import { workingDaysBetween } from "@/lib/domain/dates";
import type { Assignment, AssignmentBoundTask } from "@/lib/types";

function assignment(partial: Partial<Assignment> & { id: string }): Assignment {
  return {
    organization_id: "org",
    person_id: "pm-1",
    project_id: "proj-1",
    start_date: "2026-08-24",
    end_date: "2026-08-28",
    hours_per_day: 2,
    allocation_pct: null,
    status: "confirmed",
    notes: "Project management",
    recurrence: "none",
    recurrence_end_date: null,
    recurrence_exceptions: [],
    created_at: "2026-01-01T00:00:00.000Z",
    edited_at: null,
    edited_by_profile_id: null,
    ...partial,
  };
}

describe("applyProjectManagerScheduleTime bound-task protection", () => {
  it("does not delete protected assignments and punches their days", async () => {
    const existing = [
      assignment({ id: "pm-hours", hours_per_day: 2 }),
      assignment({
        id: "prod",
        notes: "Design",
        hours_per_day: 6,
        start_date: "2026-08-25",
        end_date: "2026-08-26",
      }),
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
    const deleted: string[] = [];
    const byId = new Map<string, Assignment>();
    let n = 0;

    const result = await applyProjectManagerScheduleTime({
      organizationId: "org",
      projectId: "proj-1",
      managerPersonId: "pm-1",
      startDate: "2026-08-24",
      endDate: "2026-08-28",
      hoursPerDay: 3,
      assignments: existing,
      leaveDays: [],
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

    expect(result.created).toBe(true);
    expect(deleted).toContain("pm-hours");
    expect(deleted).not.toContain("prod");
    expect(result.leaveTrimmed).toBe(true);

    const booked = new Set<string>();
    for (const a of byId.values()) {
      for (const occ of expandAssignmentInRange(
        a,
        "2026-08-24",
        "2026-08-28",
      )) {
        for (const day of workingDaysBetween(occ.start_date, occ.end_date)) {
          booked.add(day);
        }
      }
    }
    expect(booked.has("2026-08-25")).toBe(false);
    expect(booked.has("2026-08-26")).toBe(false);
    expect(booked.has("2026-08-24") || booked.has("2026-08-27")).toBe(true);
  });

  it("never deletes a protected id even if punch returns it", async () => {
    const deleteAssignment = vi.fn();
    await applyProjectManagerScheduleTime({
      organizationId: "org",
      projectId: "proj-1",
      managerPersonId: "pm-1",
      startDate: "2026-08-24",
      endDate: "2026-08-28",
      hoursPerDay: 2,
      assignments: [
        assignment({
          id: "prod",
          start_date: "2026-08-24",
          end_date: "2026-08-28",
          hours_per_day: 8,
        }),
      ],
      leaveDays: [],
      assignmentBoundTasks: [
        {
          assignment_id: "prod",
          task_id: "task-1",
          organization_id: "org",
          sort_order: 0,
          bound_source: "project",
          out_of_sync: false,
        },
      ],
      newId: (prefix) => `${prefix}-x`,
      upsertAssignment: () => {},
      deleteAssignment,
    });
    expect(deleteAssignment.mock.calls.map((c) => c[0])).not.toContain("prod");
  });
});
