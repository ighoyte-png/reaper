import { addWeeks, differenceInCalendarWeeks } from "date-fns";
import { describe, expect, it } from "vitest";
import { parseDateKey, toDateKey, weekStart } from "@/lib/domain/dates";
import {
  defaultDayWeeksShown,
  ganttDayColumnWindow,
} from "@/lib/domain/schedule-zoom";

describe("ganttDayColumnWindow", () => {
  const midAnchor = weekStart(parseDateKey("2026-06-15"));

  it("uses default weeks from anchor when timeline is missing", () => {
    expect(
      ganttDayColumnWindow({
        anchor: midAnchor,
        startDate: null,
        endDate: null,
        isNarrow: false,
      }),
    ).toEqual({
      columnAnchor: midAnchor,
      weeksShown: defaultDayWeeksShown(false),
    });

    expect(
      ganttDayColumnWindow({
        anchor: midAnchor,
        startDate: "2026-01-01",
        endDate: null,
        isNarrow: true,
      }),
    ).toEqual({
      columnAnchor: midAnchor,
      weeksShown: defaultDayWeeksShown(true),
    });
  });

  it("covers full project timeline when today is mid-project", () => {
    const { columnAnchor, weeksShown } = ganttDayColumnWindow({
      anchor: midAnchor,
      startDate: "2026-01-05",
      endDate: "2026-12-20",
      isNarrow: false,
    });

    const timelineStart = weekStart(parseDateKey("2026-01-05"));
    const timelineEnd = weekStart(parseDateKey("2026-12-20"));
    expect(toDateKey(columnAnchor)).toBe(toDateKey(timelineStart));

    const rangeEnd = addWeeks(columnAnchor, weeksShown - 1);
    expect(rangeEnd.getTime()).toBeGreaterThanOrEqual(timelineEnd.getTime());
    expect(weeksShown).toBeGreaterThan(defaultDayWeeksShown(false));
  });

  it("starts at anchor when today is before project start", () => {
    const before = weekStart(parseDateKey("2026-01-05"));
    const { columnAnchor, weeksShown } = ganttDayColumnWindow({
      anchor: before,
      startDate: "2026-03-01",
      endDate: "2026-06-30",
      isNarrow: false,
    });

    expect(toDateKey(columnAnchor)).toBe(toDateKey(before));
    const rangeEnd = addWeeks(columnAnchor, weeksShown - 1);
    const timelineEnd = weekStart(parseDateKey("2026-06-30"));
    expect(rangeEnd.getTime()).toBeGreaterThanOrEqual(timelineEnd.getTime());
  });

  it("starts at project start when today is after project end", () => {
    const after = weekStart(parseDateKey("2026-12-07"));
    const { columnAnchor, weeksShown } = ganttDayColumnWindow({
      anchor: after,
      startDate: "2026-01-05",
      endDate: "2026-03-31",
      isNarrow: false,
    });

    const timelineStart = weekStart(parseDateKey("2026-01-05"));
    expect(toDateKey(columnAnchor)).toBe(toDateKey(timelineStart));

    const windowEnd = addWeeks(after, defaultDayWeeksShown(false) - 1);
    const rangeEnd = addWeeks(columnAnchor, weeksShown - 1);
    expect(toDateKey(rangeEnd)).toBe(toDateKey(windowEnd));
  });

  it("grows into the past when anchor is before timeline start", () => {
    const early = weekStart(parseDateKey("2025-11-03"));
    const { columnAnchor, weeksShown } = ganttDayColumnWindow({
      anchor: early,
      startDate: "2026-01-05",
      endDate: "2026-02-28",
      isNarrow: false,
    });

    expect(toDateKey(columnAnchor)).toBe(toDateKey(early));
    const timelineEnd = weekStart(parseDateKey("2026-02-28"));
    expect(addWeeks(columnAnchor, weeksShown - 1).getTime()).toBeGreaterThanOrEqual(
      timelineEnd.getTime(),
    );
  });

  it("uses narrow default pad of 8 weeks", () => {
    const shortStart = "2026-06-01";
    const shortEnd = "2026-06-14";
    const { columnAnchor, weeksShown } = ganttDayColumnWindow({
      anchor: midAnchor,
      startDate: shortStart,
      endDate: shortEnd,
      isNarrow: true,
    });

    const timelineStart = weekStart(parseDateKey(shortStart));
    expect(toDateKey(columnAnchor)).toBe(toDateKey(timelineStart));
    // Short timeline still pads to at least the narrow default window from midAnchor.
    expect(weeksShown).toBeGreaterThanOrEqual(defaultDayWeeksShown(true));
    expect(
      differenceInCalendarWeeks(
        addWeeks(columnAnchor, weeksShown - 1),
        columnAnchor,
        { weekStartsOn: 1 },
      ) + 1,
    ).toBe(weeksShown);
  });

  it("swaps inverted start/end dates", () => {
    const { columnAnchor, weeksShown } = ganttDayColumnWindow({
      anchor: midAnchor,
      startDate: "2026-12-01",
      endDate: "2026-01-05",
      isNarrow: false,
    });
    expect(toDateKey(columnAnchor)).toBe(
      toDateKey(weekStart(parseDateKey("2026-01-05"))),
    );
    expect(weeksShown).toBeGreaterThan(1);
  });
});
