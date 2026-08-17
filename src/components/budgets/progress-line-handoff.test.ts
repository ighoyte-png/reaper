import { describe, expect, it } from "vitest";
import { progressLineHandoffIndex } from "@/components/budgets/progress-line-handoff";

function flags(
  kind: "current" | "future" | "past",
): { isCurrentWeek: boolean; isFuture: boolean } {
  return {
    isCurrentWeek: kind === "current",
    isFuture: kind === "future",
  };
}

describe("progressLineHandoffIndex", () => {
  it("returns -1 for an empty series", () => {
    expect(progressLineHandoffIndex([])).toBe(-1);
  });

  it("handoffs at the last point when the entire span is past", () => {
    expect(
      progressLineHandoffIndex([
        flags("past"),
        flags("past"),
        flags("past"),
      ]),
    ).toBe(2);
  });

  it("handoffs at the current week when present", () => {
    expect(
      progressLineHandoffIndex([
        flags("past"),
        flags("current"),
        flags("future"),
      ]),
    ).toBe(1);
  });

  it("handoffs at the week before the first future week when none is current", () => {
    expect(
      progressLineHandoffIndex([
        flags("past"),
        flags("past"),
        flags("future"),
        flags("future"),
      ]),
    ).toBe(1);
  });

  it("handoffs at 0 when the entire span is future", () => {
    expect(
      progressLineHandoffIndex([
        flags("future"),
        flags("future"),
        flags("future"),
      ]),
    ).toBe(0);
  });
});
