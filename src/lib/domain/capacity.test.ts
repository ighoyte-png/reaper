import { describe, expect, it } from "vitest";
import {
  buildBookedHoursByPersonDay,
  capacityLevel,
  personBookedHoursInRange,
  projectEndLookupFromProjects,
  sumBookedHoursFromDayMap,
  utilizationPct,
} from "@/lib/domain/capacity";
import { expandAssignmentsInRange } from "@/lib/domain/recurrence";
import type { Assignment } from "@/lib/types";

describe("capacityLevel", () => {
  const thresholds = {
    lowMaxPct: 60,
    nearPct: 85,
    overPct: 101,
  };

  it("treats exactly 100% as not over when over threshold is 101%", () => {
    // 40 booked / 40 available = 100%
    expect(capacityLevel(40, 40, false, thresholds)).toBe("near");
  });

  it("turns over only when utilization reaches the configured over %", () => {
    expect(capacityLevel(40.4, 40, false, thresholds)).toBe("over");
  });

  it("uses low / healthy / near bands from settings", () => {
    expect(capacityLevel(20, 40, false, thresholds)).toBe("low"); // 50%
    expect(capacityLevel(28, 40, false, thresholds)).toBe("healthy"); // 70%
    expect(capacityLevel(36, 40, false, thresholds)).toBe("near"); // 90%
  });

  it("does not use hard-coded 100% over when thresholds are provided", () => {
    expect(utilizationPct(40, 40)).toBe(100);
    expect(capacityLevel(40, 40, false, { overPct: 100 })).toBe("over");
    expect(capacityLevel(40, 40, false, { overPct: 101 })).not.toBe("over");
  });
});

function weekly(partial: Partial<Assignment> = {}): Assignment {
  return {
    id: "a1",
    organization_id: "org",
    person_id: "p1",
    project_id: "proj-1",
    start_date: "2026-03-17",
    end_date: "2026-03-17",
    hours_per_day: 8,
    allocation_pct: null,
    status: "confirmed",
    notes: "",
    recurrence: "weekly",
    recurrence_end_date: null,
    recurrence_exceptions: [],
    created_at: "2026-03-17T00:00:00.000Z",
    edited_at: null,
    edited_by_profile_id: null,
    ...partial,
  };
}

describe("personBookedHoursInRange project-end parity with Schedule", () => {
  const assignments = [weekly()];
  const leaveDays: never[] = [];
  // Week after project end (Mon–Fri).
  const weekStart = "2026-04-13";
  const weekEnd = "2026-04-17";

  it("excludes weekly occurrences past the project end (Schedule truth)", () => {
    const projectEndById = projectEndLookupFromProjects([
      { id: "proj-1", end_date: "2026-04-07" },
    ]);
    expect(
      personBookedHoursInRange(
        "p1",
        weekStart,
        weekEnd,
        assignments,
        leaveDays,
        true,
        projectEndById,
      ),
    ).toBe(0);
  });

  it("still counts the week when project end is omitted (legacy undercount gap)", () => {
    expect(
      personBookedHoursInRange(
        "p1",
        weekStart,
        weekEnd,
        assignments,
        leaveDays,
      ),
    ).toBe(8);
  });

  it("matches expand → day map → sum used by Schedule util bands", () => {
    const projectEndById = projectEndLookupFromProjects([
      { id: "proj-1", end_date: "2026-04-07" },
    ]);
    const rangeStart = "2026-03-16";
    const rangeEnd = "2026-04-17";
    const occurrences = expandAssignmentsInRange(
      assignments,
      rangeStart,
      rangeEnd,
      projectEndById,
    );
    const dayMap = buildBookedHoursByPersonDay(occurrences, leaveDays);
    const scheduleBooked = sumBookedHoursFromDayMap(
      dayMap.get("p1"),
      weekStart,
      weekEnd,
      "p1",
      leaveDays,
    );
    const helperBooked = personBookedHoursInRange(
      "p1",
      weekStart,
      weekEnd,
      assignments,
      leaveDays,
      true,
      projectEndById,
    );
    expect(helperBooked).toBe(scheduleBooked);
    expect(helperBooked).toBe(0);
  });
});
