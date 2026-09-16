import { describe, expect, it } from "vitest";
import {
  findListAttachedToMilestone,
  milestoneDateProgress,
} from "@/lib/domain/progress";

describe("milestoneDateProgress", () => {
  const project = { start_date: "2026-01-01" };
  const milestone = {
    start_date: "2026-02-01",
    due_date: "2026-04-01",
  };

  it("uses attached list dates when both are set (Gantt-linked)", () => {
    const list = {
      id: "list-1",
      milestone_id: "ms-1",
      start_date: "2026-01-01",
      end_date: "2026-01-10",
    };
    expect(
      milestoneDateProgress(milestone, project, "2026-01-10", list),
    ).toBe(100);
    expect(
      milestoneDateProgress(milestone, project, "2026-01-01", list),
    ).toBe(0);
  });

  it("falls back to milestone/project dates without an attached list window", () => {
    expect(
      milestoneDateProgress(milestone, project, "2026-03-01", null),
    ).toBe(
      milestoneDateProgress(milestone, project, "2026-03-01", undefined),
    );
    expect(
      findListAttachedToMilestone(
        [
          {
            id: "a",
            milestone_id: "other",
            start_date: "2026-01-01",
            end_date: "2026-02-01",
          },
        ],
        "ms-1",
      ),
    ).toBeNull();
  });
});
