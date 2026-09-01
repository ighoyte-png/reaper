import { describe, expect, it } from "vitest";
import {
  progressWeekLineSegmentBounds,
  progressWeekSegmentEndpoints,
} from "@/components/budgets/chart-hover";

describe("progressWeekLineSegmentBounds", () => {
  const padL = 44;
  const plotW = 600;

  function xAt(i: number, pointCount: number) {
    if (pointCount <= 1) return padL + plotW / 2;
    return padL + (i / (pointCount - 1)) * plotW;
  }

  it("spans xAt(0) to xAt(1) for week index 1", () => {
    const pointCount = 4;
    const x = xAt;
    const band = progressWeekLineSegmentBounds(1, pointCount, padL, plotW, (i) =>
      x(i, pointCount),
    );
    expect(band.x).toBe(xAt(0, pointCount));
    expect(band.x + band.width).toBe(xAt(1, pointCount));
  });

  it("spans padL through first half-slot for week index 0 when xAt(0) equals padL", () => {
    const pointCount = 4;
    const band = progressWeekLineSegmentBounds(0, pointCount, padL, plotW, (i) =>
      xAt(i, pointCount),
    );
    expect(band.x).toBe(padL);
    expect(band.width).toBe((xAt(1, pointCount) - padL) / 2);
  });

  it("uses full plot width for a single point", () => {
    const band = progressWeekLineSegmentBounds(0, 1, padL, plotW, () => padL);
    expect(band.x).toBe(padL);
    expect(band.width).toBe(plotW);
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
