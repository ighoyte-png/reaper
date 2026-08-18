import { describe, expect, it } from "vitest";
import {
  buildPmScheduleAssignments,
  snapPmTimelineToScheduleDays,
} from "@/lib/domain/project-manager-schedule";

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
