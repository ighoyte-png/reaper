import { describe, expect, it } from "vitest";
import { sliceWeeklyOccurrenceAt } from "@/lib/domain/leave-override";
import type { Assignment } from "@/lib/types";

function weeklyAssignment(
  patch: Partial<Assignment> & Pick<Assignment, "id" | "start_date" | "end_date">,
): Assignment {
  return {
    organization_id: "org",
    person_id: "p1",
    project_id: "proj",
    hours_per_day: 8,
    status: "confirmed",
    recurrence: "weekly",
    recurrence_end_date: patch.recurrence_end_date ?? null,
    recurrence_exceptions: [],
    notes: null,
    ...patch,
  };
}

describe("sliceWeeklyOccurrenceAt", () => {
  it("splits the first weekly occurrence and continues the series", () => {
    const base = weeklyAssignment({
      id: "asg-1",
      start_date: "2026-08-24",
      end_date: "2026-08-26",
      recurrence_end_date: "2026-09-09",
    });
    let n = 0;
    const { upserts, deletes } = sliceWeeklyOccurrenceAt(
      base,
      "2026-08-25",
      "2026-08-24",
      "2026-08-26",
      () => `new-${++n}`,
    );

    expect(deletes).toEqual(["asg-1"]);
    expect(upserts).toHaveLength(3);
    expect(upserts[0]).toMatchObject({
      start_date: "2026-08-24",
      end_date: "2026-08-25",
      recurrence: "none",
    });
    expect(upserts[1]).toMatchObject({
      start_date: "2026-08-26",
      end_date: "2026-08-26",
      recurrence: "none",
    });
    expect(upserts[2]).toMatchObject({
      start_date: "2026-08-31",
      end_date: "2026-09-02",
      recurrence: "weekly",
      recurrence_end_date: "2026-09-09",
    });
  });

  it("trims the original series when slicing a later occurrence", () => {
    const base = weeklyAssignment({
      id: "asg-1",
      start_date: "2026-08-24",
      end_date: "2026-08-26",
      recurrence_end_date: "2026-09-09",
    });
    let n = 0;
    const { upserts, deletes } = sliceWeeklyOccurrenceAt(
      base,
      "2026-09-01",
      "2026-08-31",
      "2026-09-02",
      () => `new-${++n}`,
    );

    expect(deletes).toEqual([]);
    expect(upserts).toHaveLength(4);
    expect(upserts[0]).toMatchObject({
      start_date: "2026-08-31",
      end_date: "2026-09-01",
      recurrence: "none",
    });
    expect(upserts[1]).toMatchObject({
      start_date: "2026-09-02",
      end_date: "2026-09-02",
      recurrence: "none",
    });
    expect(upserts[2]).toMatchObject({
      start_date: "2026-09-07",
      end_date: "2026-09-09",
      recurrence: "weekly",
    });
    expect(upserts[3]).toMatchObject({
      id: "asg-1",
      recurrence_end_date: "2026-08-28",
    });
  });

  it("rejects slicing on the last day of the occurrence", () => {
    const base = weeklyAssignment({
      id: "asg-1",
      start_date: "2026-08-24",
      end_date: "2026-08-26",
    });
    const result = sliceWeeklyOccurrenceAt(
      base,
      "2026-08-26",
      "2026-08-24",
      "2026-08-26",
      () => "new-1",
    );
    expect(result).toEqual({ upserts: [], deletes: [] });
  });
});
