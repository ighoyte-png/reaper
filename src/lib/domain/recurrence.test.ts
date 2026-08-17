import { describe, expect, it } from "vitest";
import {
  assignmentOverlapsDateRange,
  expandAssignmentInRange,
  weeklySeriesEndDate,
} from "@/lib/domain/recurrence";
import type { Assignment } from "@/lib/types";

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

describe("weeklySeriesEndDate", () => {
  it("defaults to 12 months after start when there is no project end", () => {
    expect(weeklySeriesEndDate(weekly())).toBe("2027-03-17");
  });

  it("uses the project end when no series end is set", () => {
    expect(weeklySeriesEndDate(weekly(), "2026-08-14")).toBe("2026-08-14");
  });

  it("keeps an explicit series end earlier than the project end", () => {
    expect(
      weeklySeriesEndDate(
        weekly({ recurrence_end_date: "2026-04-14" }),
        "2026-12-31",
      ),
    ).toBe("2026-04-14");
  });

  it("clamps an explicit series end after the project end", () => {
    expect(
      weeklySeriesEndDate(
        weekly({ recurrence_end_date: "2027-01-01" }),
        "2026-06-01",
      ),
    ).toBe("2026-06-01");
  });
});

describe("expandAssignmentInRange weekly cap", () => {
  it("does not emit occurrences after start + 12 months", () => {
    const occs = expandAssignmentInRange(
      weekly(),
      "2026-03-01",
      "2028-04-01",
    );
    expect(occs[0]?.start_date).toBe("2026-03-17");
    expect(occs[occs.length - 1]?.start_date).toBe("2027-03-16");
    expect(occs.every((o) => o.start_date <= "2027-03-17")).toBe(true);
  });

  it("stops at the project end date", () => {
    const occs = expandAssignmentInRange(
      weekly(),
      "2026-03-01",
      "2028-04-01",
      "2026-04-07",
    );
    expect(occs[occs.length - 1]?.start_date).toBe("2026-04-07");
  });

  it("keeps an earlier explicit series end", () => {
    const occs = expandAssignmentInRange(
      weekly({ recurrence_end_date: "2026-03-24" }),
      "2026-03-01",
      "2028-04-01",
      "2026-12-31",
    );
    expect(occs.map((o) => o.start_date)).toEqual([
      "2026-03-17",
      "2026-03-24",
    ]);
  });

  it("clamps an explicit series end after the project", () => {
    const occs = expandAssignmentInRange(
      weekly({ recurrence_end_date: "2027-01-01" }),
      "2026-03-01",
      "2028-04-01",
      "2026-03-24",
    );
    expect(occs[occs.length - 1]?.start_date).toBe("2026-03-24");
  });
});

describe("assignmentOverlapsDateRange weekly cap", () => {
  it("is false past the 12-month default", () => {
    expect(
      assignmentOverlapsDateRange(weekly(), "2028-01-01", "2028-01-31"),
    ).toBe(false);
  });
});
