import { addMonths, addWeeks, format } from "date-fns";
import {
  endOfMonth,
  getWeekdays,
  monthWorkingBounds,
  startOfMonth,
  toDateKey,
  weekEnd,
  weekStart,
  workingDaysBetween,
} from "@/lib/domain/dates";

export type ScheduleZoom = "day" | "week" | "month";

export type ScheduleColumn = {
  id: string;
  /** Secondary header (day number, week start day, month name). */
  label: string;
  /** Top sticky header (month abbr / year). */
  groupLabel: string;
  startKey: string;
  endKey: string;
  width: number;
  groupIndex: number;
  isToday: boolean;
};

export function buildScheduleColumns(opts: {
  zoom: ScheduleZoom;
  anchor: Date;
  todayKey: string;
  dayW: number;
  isNarrow: boolean;
}): { columns: ScheduleColumn[]; totalWidth: number; rangeLabel: string } {
  const { zoom, anchor, todayKey, dayW, isNarrow } = opts;

  if (zoom === "day") {
    const weeksShown = isNarrow ? 8 : 20;
    const columns: ScheduleColumn[] = [];
    for (let w = 0; w < weeksShown; w++) {
      const ws = addWeeks(weekStart(anchor), w);
      for (const day of getWeekdays(ws)) {
        const key = toDateKey(day);
        columns.push({
          id: key,
          label: format(day, "d"),
          groupLabel: format(ws, "MMM"),
          startKey: key,
          endKey: key,
          width: dayW,
          groupIndex: w,
          isToday: key === todayKey,
        });
      }
    }
    const totalWidth = columns.reduce((s, c) => s + c.width, 0);
    return {
      columns,
      totalWidth,
      rangeLabel: `${format(weekStart(anchor), "MMM d")} – ${format(
        weekEnd(addWeeks(weekStart(anchor), weeksShown - 1)),
        "MMM d, yyyy",
      )}`,
    };
  }

  if (zoom === "week") {
    const weeksShown = isNarrow ? 12 : 26;
    const colW = isNarrow ? 88 : 110;
    const columns: ScheduleColumn[] = Array.from({ length: weeksShown }, (_, w) => {
      const ws = addWeeks(weekStart(anchor), w);
      const startKey = toDateKey(ws);
      const endKey = toDateKey(weekEnd(ws));
      const weekDays = getWeekdays(ws).map(toDateKey);
      return {
        id: startKey,
        label: format(ws, "d"),
        groupLabel: format(ws, "MMM"),
        startKey,
        endKey,
        width: colW,
        groupIndex: w,
        isToday: weekDays.includes(todayKey),
      };
    });
    const totalWidth = columns.reduce((s, c) => s + c.width, 0);
    return {
      columns,
      totalWidth,
      rangeLabel: `${format(weekStart(anchor), "MMM d")} – ${format(
        weekEnd(addWeeks(weekStart(anchor), weeksShown - 1)),
        "MMM d, yyyy",
      )}`,
    };
  }

  const monthsShown = isNarrow ? 6 : 12;
  const colW = isNarrow ? 112 : 140;
  const base = startOfMonth(anchor);
  const columns: ScheduleColumn[] = Array.from({ length: monthsShown }, (_, m) => {
    const month = addMonths(base, m);
    const { startKey, endKey } = monthWorkingBounds(month);
    const monthStart = toDateKey(month);
    const monthEnd = toDateKey(endOfMonth(month));
    return {
      id: startKey,
      label: format(month, "MMM"),
      groupLabel: format(month, "yyyy"),
      startKey,
      endKey,
      width: colW,
      groupIndex: m,
      isToday: todayKey >= monthStart && todayKey <= monthEnd,
    };
  });

  const totalWidth = columns.reduce((s, c) => s + c.width, 0);
  return {
    columns,
    totalWidth,
    rangeLabel: `${format(base, "MMM yyyy")} – ${format(
      addMonths(base, monthsShown - 1),
      "MMM yyyy",
    )}`,
  };
}

export function spanColumnsPx(
  columns: ScheduleColumn[],
  startKey: string,
  endKey: string,
): { left: number; width: number } | null {
  const start = startKey <= endKey ? startKey : endKey;
  const end = startKey <= endKey ? endKey : startKey;
  let first = -1;
  let last = -1;
  for (let i = 0; i < columns.length; i++) {
    const c = columns[i];
    if (c.endKey < start || c.startKey > end) continue;
    if (first < 0) first = i;
    last = i;
  }
  if (first < 0 || last < 0) return null;
  let left = 0;
  for (let i = 0; i < first; i++) left += columns[i].width;
  let width = 0;
  for (let i = first; i <= last; i++) width += columns[i].width;
  return { left: left + 2, width: Math.max(width - 4, 8) };
}

export function columnsOverlapRange(
  col: ScheduleColumn,
  startKey: string,
  endKey: string,
): boolean {
  const start = startKey <= endKey ? startKey : endKey;
  const end = startKey <= endKey ? endKey : startKey;
  return col.endKey >= start && col.startKey <= end;
}

/** Working days of an assignment clipped to a column’s date range. */
export function overlapWorkingDays(
  startKey: string,
  endKey: string,
  col: ScheduleColumn,
): string[] {
  const a = startKey <= endKey ? startKey : endKey;
  const b = startKey <= endKey ? endKey : startKey;
  const start = a > col.startKey ? a : col.startKey;
  const end = b < col.endKey ? b : col.endKey;
  if (end < start) return [];
  return workingDaysBetween(start, end);
}

export function columnOffsetPx(
  columns: ScheduleColumn[],
  index: number,
): number {
  let left = 0;
  for (let i = 0; i < index; i++) left += columns[i].width;
  return left;
}
