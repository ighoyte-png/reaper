import { describe, expect, it } from "vitest";
import {
  progressTodaySplitX,
  progressWeekLineSegmentBounds,
  progressWeekSegmentEndpoints,
} from "@/components/budgets/chart-hover";

describe("progressWeekLineSegmentBounds", () => {
  const padL = 44;
  const plotW = 600;

  /** End-of-equal-slot xAt used by ProgressLineChart. */
  function xAt(i: number, pointCount: number) {
    if (pointCount <= 1) return padL + plotW / 2;
    return padL + ((i + 1) / pointCount) * plotW;
  }

  it("spans xAt(0) to xAt(1) for week index 1", () => {
    const pointCount = 4;
    const band = progressWeekLineSegmentBounds(1, pointCount, padL, plotW, (i) =>
      xAt(i, pointCount),
    );
    expect(band.x).toBe(xAt(0, pointCount));
    expect(band.x + band.width).toBe(xAt(1, pointCount));
  });

  it("spans padL to xAt(0) for week index 0 (no half-slot hack)", () => {
    const pointCount = 4;
    const band = progressWeekLineSegmentBounds(0, pointCount, padL, plotW, (i) =>
      xAt(i, pointCount),
    );
    expect(band.x).toBe(padL);
    expect(band.x + band.width).toBe(xAt(0, pointCount));
    expect(band.width).toBe(plotW / pointCount);
  });

  it("gives equal week bands on a 2-week (short) chart", () => {
    const pointCount = 2;
    const band0 = progressWeekLineSegmentBounds(0, pointCount, padL, plotW, (i) =>
      xAt(i, pointCount),
    );
    const band1 = progressWeekLineSegmentBounds(1, pointCount, padL, plotW, (i) =>
      xAt(i, pointCount),
    );
    expect(band0.width).toBeCloseTo(plotW / 2);
    expect(band1.width).toBeCloseTo(plotW / 2);
    expect(band0.x + band0.width).toBeCloseTo(band1.x);
    expect(band1.x + band1.width).toBeCloseTo(padL + plotW);
  });

  it("keeps adjacent bands local on longer series", () => {
    const pointCount = 8;
    const slot = plotW / pointCount;
    for (let i = 0; i < pointCount; i += 1) {
      const band = progressWeekLineSegmentBounds(
        i,
        pointCount,
        padL,
        plotW,
        (j) => xAt(j, pointCount),
      );
      expect(band.width).toBeCloseTo(slot);
    }
  });

  it("uses full plot width for a single point", () => {
    const band = progressWeekLineSegmentBounds(0, 1, padL, plotW, () => padL);
    expect(band.x).toBe(padL);
    expect(band.width).toBe(plotW);
  });
});

describe("progressTodaySplitX", () => {
  it("keeps todayX at or before week end on current week index 0", () => {
    const bandX = 44;
    const bandWidth = 300;
    const split = progressTodaySplitX({
      weekStartKey: "2026-11-23",
      weekEndKey: "2026-11-29",
      todayKey: "2026-11-27",
      bandX,
      bandWidth,
    });
    expect(split).not.toBeNull();
    expect(split!.todayX).toBeGreaterThanOrEqual(bandX);
    expect(split!.todayX).toBeLessThanOrEqual(split!.weekEndX);
    expect(split!.weekEndX).toBe(bandX + bandWidth);
    // Mid-week (Thu) should not be left of band start — no leftward dashed geometry.
    expect(split!.todayX).toBeGreaterThan(bandX);
  });

  it("clamps today to week end when after weekEndKey", () => {
    const split = progressTodaySplitX({
      weekStartKey: "2026-11-23",
      weekEndKey: "2026-11-29",
      todayKey: "2026-12-01",
      bandX: 0,
      bandWidth: 100,
    });
    expect(split!.frac).toBe(1);
    expect(split!.todayX).toBe(100);
  });
});

describe("progressWeekSegmentEndpoints", () => {
  it("returns adjacent indices for week index 1", () => {
    expect(progressWeekSegmentEndpoints(1, 4)).toEqual({
      startIdx: 0,
      endIdx: 1,
    });
  });

  it("returns 0,0 for a single point", () => {
    expect(progressWeekSegmentEndpoints(0, 1)).toEqual({
      startIdx: 0,
      endIdx: 0,
    });
  });

  it("returns 0,0 for first week on multi-point chart", () => {
    expect(progressWeekSegmentEndpoints(0, 4)).toEqual({
      startIdx: 0,
      endIdx: 0,
    });
  });
});
