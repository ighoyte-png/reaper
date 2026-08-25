import { describe, expect, it } from "vitest";
import { punchProjectRowForInsertRange } from "@/lib/domain/assignment-occupancy";
import type { Assignment } from "@/lib/types";

function asg(
  partial: Partial<Assignment> & Pick<Assignment, "id" | "start_date" | "end_date">,
): Assignment {
  return {
    organization_id: "org",
    person_id: "p1",
    project_id: "proj",
    hours_per_day: 8,
    allocation_pct: 50,
    status: "confirmed",
    notes: null,
    recurrence: "none",
    recurrence_end_date: null,
    recurrence_exceptions: [],
    created_at: "",
    edited_at: null,
    edited_by_profile_id: null,
    ...partial,
  };
}

describe("punchProjectRowForInsertRange", () => {
  it("punches a single day out of a weekly PM block", () => {
    const weekly = asg({
      id: "pm-1",
      start_date: "2026-08-24",
      end_date: "2026-08-26",
      recurrence: "weekly",
      recurrence_end_date: "2026-09-09",
    });
    let n = 0;
    const { upserts, deletes } = punchProjectRowForInsertRange(
      [weekly],
      "p1",
      "proj",
      "2026-08-25",
      "2026-08-25",
      () => `new-${++n}`,
    );

    expect(deletes).toEqual(["pm-1"]);
    expect(upserts.length).toBeGreaterThanOrEqual(2);
    expect(
      upserts.some(
        (a) =>
          a.recurrence === "none" &&
          a.start_date === "2026-08-24" &&
          a.end_date === "2026-08-24",
      ),
    ).toBe(true);
    expect(
      upserts.some(
        (a) =>
          a.recurrence === "none" &&
          a.start_date === "2026-08-26" &&
          a.end_date === "2026-08-26",
      ),
    ).toBe(true);
  });

  it("does not punch assignments on other projects", () => {
    const otherProject = asg({
      id: "other",
      start_date: "2026-03-02",
      end_date: "2026-03-02",
      project_id: "other-proj",
    });
    const { upserts, deletes } = punchProjectRowForInsertRange(
      [otherProject],
      "p1",
      "proj",
      "2026-03-02",
      "2026-03-02",
      () => "new-1",
    );
    expect(deletes).toEqual([]);
    expect(upserts).toEqual([]);
  });
});
