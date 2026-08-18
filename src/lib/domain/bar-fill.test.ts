import { describe, expect, it } from "vitest";
import {
  barFillCapClass,
  burnBarFillSegments,
  utilizationBarSlices,
} from "@/lib/domain/bar-fill";

describe("burnBarFillSegments", () => {
  it("keeps contractor green and internal blue when healthy", () => {
    expect(
      burnBarFillSegments({
        contractorPct: 20,
        usedPct: 30,
        futurePct: 10,
        health: "healthy",
        warningPct: 90,
      }),
    ).toEqual([
      { width: 20, tone: "contractor", hatched: false },
      { width: 30, tone: "internal", hatched: false },
      { width: 10, tone: "internal", hatched: true },
    ]);
  });

  it("paints only the warning band orange and leaves contractor green", () => {
    expect(
      burnBarFillSegments({
        contractorPct: 20,
        usedPct: 65,
        futurePct: 10,
        health: "near",
        warningPct: 90,
      }),
    ).toEqual([
      { width: 20, tone: "contractor", hatched: false },
      { width: 65, tone: "internal", hatched: false },
      { width: 5, tone: "internal", hatched: true },
      { width: 5, tone: "warning", hatched: true },
    ]);
  });

  it("splits used hours that cross the warning threshold", () => {
    expect(
      burnBarFillSegments({
        contractorPct: 0,
        usedPct: 95,
        futurePct: 0,
        health: "near",
        warningPct: 90,
      }),
    ).toEqual([
      { width: 90, tone: "internal", hatched: false },
      { width: 5, tone: "warning", hatched: false },
    ]);
  });

  it("keeps contractor green even when it sits in the warning band", () => {
    expect(
      burnBarFillSegments({
        contractorPct: 95,
        usedPct: 0,
        futurePct: 0,
        health: "near",
        warningPct: 90,
      }),
    ).toEqual([{ width: 95, tone: "contractor", hatched: false }]);
  });

  it("paints the entire bar red when over", () => {
    expect(
      burnBarFillSegments({
        contractorPct: 20,
        usedPct: 50,
        futurePct: 40,
        health: "over",
        warningPct: 90,
      }),
    ).toEqual([
      { width: 20, tone: "over", hatched: false },
      { width: 50, tone: "over", hatched: false },
      { width: 40, tone: "over", hatched: true },
    ]);
  });
});

describe("utilizationBarSlices", () => {
  it("keeps the whole fill gray while underutilized", () => {
    expect(utilizationBarSlices(40, "low", 85)).toEqual([
      { width: 40, tone: "low" },
    ]);
  });

  it("keeps the whole fill green in the healthy band", () => {
    expect(utilizationBarSlices(70, "healthy", 85)).toEqual([
      { width: 70, tone: "healthy" },
    ]);
  });

  it("paints orange only from the warning threshold to the fill", () => {
    expect(utilizationBarSlices(92, "near", 85)).toEqual([
      { width: 85, tone: "healthy" },
      { width: 7, tone: "near" },
    ]);
  });

  it("paints the entire fill red when over", () => {
    expect(utilizationBarSlices(100, "over", 85)).toEqual([
      { width: 100, tone: "over" },
    ]);
  });
});

describe("barFillCapClass", () => {
  it("rounds both ends when there is a single fill", () => {
    expect(barFillCapClass(0, 1)).toBe("rounded-full");
  });

  it("rounds the leading and trailing caps of a split fill", () => {
    expect(barFillCapClass(0, 3)).toBe("rounded-l-full");
    expect(barFillCapClass(1, 3)).toBe("");
    expect(barFillCapClass(2, 3)).toBe("rounded-r-full");
  });
});
