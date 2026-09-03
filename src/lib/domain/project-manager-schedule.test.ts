import { describe, expect, it } from "vitest";
import {
  assignmentIdsWithBoundTasks,
  buildPmScheduleAssignments,
  existingPmDailyHours,
  partitionPmProjectAssignments,
  protectedPmOccurrenceDates,
  resolvePmScheduleIntent,
  snapPmTimelineToScheduleDays,
} from "@/lib/domain/project-manager-schedule";
import type { Assignment } from "@/lib/types";

function build(startDate: string, endDate: string) {
  let n = 0;
  return buildPmScheduleAssignments({
    newId: () => `asg-${++n}`,
    organizationId: "org",
    personId: "pm-1",
    projectId: "proj-1",
    startDate,
    endDate,
    hoursPerDay: 2,
  });
}

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

describe("snapPmTimelineToScheduleDays", () => {
  it("rolls a Saturday start forward to Monday", () => {
    // 2026-08-22 Sat → 2026-10-18 Sun
    expect(
      snapPmTimelineToScheduleDays("2026-08-22", "2026-10-18"),
    ).toEqual({ start: "2026-08-24", end: "2026-10-16" });
  });

  it("rolls a Sunday end back to the Friday before", () => {
    expect(
      snapPmTimelineToScheduleDays("2026-08-17", "2026-08-23"),
    ).toEqual({ start: "2026-08-17", end: "2026-08-21" });
  });

  it("skips full-day leave at the start", () => {
    expect(
      snapPmTimelineToScheduleDays("2026-08-24", "2026-09-04", ["2026-08-24"]),
    ).toEqual({ start: "2026-08-25", end: "2026-09-04" });
  });

  it("skips full-day leave at the end by walking backward", () => {
    expect(
      snapPmTimelineToScheduleDays("2026-08-24", "2026-08-28", ["2026-08-28"]),
    ).toEqual({ start: "2026-08-24", end: "2026-08-27" });
  });

  it("returns null when the only days are a weekend", () => {
    expect(snapPmTimelineToScheduleDays("2026-08-22", "2026-08-23")).toBeNull();
  });
});

describe("buildPmScheduleAssignments after weekend snap", () => {
  it("books a weekly series when the timeline starts on Saturday", () => {
    const snapped = snapPmTimelineToScheduleDays("2026-08-22", "2026-09-18");
    expect(snapped).not.toBeNull();
    const rows = build(snapped!.start, snapped!.end);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.start_date).toBe("2026-08-24");
    expect(rows[0]!.recurrence).toBe("weekly");
    expect(rows[0]!.recurrence_end_date).toBe("2026-09-18");
  });

  it("clips the series end to the Friday before a Sunday completion", () => {
    const snapped = snapPmTimelineToScheduleDays("2026-08-17", "2026-08-23");
    expect(snapped).not.toBeNull();
    const rows = build(snapped!.start, snapped!.end);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.recurrence_end_date).toBe("2026-08-21");
  });
});

describe("bound-task protection helpers", () => {
  it("partitions protected vs replaceable by bound assignment ids", () => {
    const rows = [
      assignment({ id: "pm-hours" }),
      assignment({
        id: "prod",
        notes: "Design",
        hours_per_day: 6,
        start_date: "2026-08-24",
        end_date: "2026-08-26",
      }),
    ];
    const protectedIds = assignmentIdsWithBoundTasks([
      { assignment_id: "prod" },
    ]);
    const parts = partitionPmProjectAssignments(rows, protectedIds);
    expect(parts.protected.map((a) => a.id)).toEqual(["prod"]);
    expect(parts.replaceable.map((a) => a.id)).toEqual(["pm-hours"]);
  });

  it("prefills daily hours from replaceable only", () => {
    const rows = [
      assignment({ id: "pm-hours", hours_per_day: 2 }),
      assignment({ id: "prod", hours_per_day: 8 }),
    ];
    expect(
      existingPmDailyHours(rows, "pm-1", "proj-1", [
        { assignment_id: "prod" },
      ]),
    ).toBe(2);
    expect(
      existingPmDailyHours(rows, "pm-1", "proj-1", [
        { assignment_id: "pm-hours" },
        { assignment_id: "prod" },
      ]),
    ).toBeNull();
  });

  it("lists working days covered by protected occurrences", () => {
    const protectedRows = [
      assignment({
        id: "prod",
        start_date: "2026-08-25",
        end_date: "2026-08-26",
      }),
    ];
    expect(
      protectedPmOccurrenceDates(protectedRows, "2026-08-24", "2026-08-28"),
    ).toEqual(["2026-08-25", "2026-08-26"]);
  });
});

describe("resolvePmScheduleIntent with bound tasks", () => {
  const base = {
    managerPersonId: "pm-1",
    startDate: "2026-08-24",
    endDate: "2026-09-18",
    datesChanged: false,
  };

  it("treats protected-only existing as create", () => {
    const intent = resolvePmScheduleIntent({
      ...base,
      pmDailyHours: 2,
      existing: [assignment({ id: "prod", hours_per_day: 8 })],
      boundTasks: [{ assignment_id: "prod" }],
    });
    expect(intent).toEqual({ kind: "create", hours: 2 });
  });

  it("prompts overwrite when replaceable rows exist", () => {
    const intent = resolvePmScheduleIntent({
      ...base,
      pmDailyHours: 3,
      existing: [
        assignment({ id: "pm-hours", hours_per_day: 2 }),
        assignment({ id: "prod", hours_per_day: 8 }),
      ],
      boundTasks: [{ assignment_id: "prod" }],
    });
    expect(intent).toEqual({ kind: "overwrite", hours: 3 });
  });

  it("does not overwrite when replaceable hours are unchanged", () => {
    const intent = resolvePmScheduleIntent({
      ...base,
      pmDailyHours: 2,
      existing: [
        assignment({ id: "pm-hours", hours_per_day: 2 }),
        assignment({ id: "prod", hours_per_day: 8 }),
      ],
      boundTasks: [{ assignment_id: "prod" }],
    });
    expect(intent).toEqual({ kind: "none" });
  });
});
