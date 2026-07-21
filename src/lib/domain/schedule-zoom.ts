import { addMonths, addWeeks, format, getWeek } from "date-fns";
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
  /** Exact today (day) or band containing today (week/month). */
  isToday: boolean;
  /** Day/week zoom: column belongs to the calendar week that contains today. */
  isCurrentWeek: boolean;
  /** Last column of a week — thicker separator before the next week. */
  isWeekBoundaryEnd: boolean;
  /** ISO-style week number (Mon-based), when applicable. */
  weekOfYear: number | null;
  year: number;
};

function weekMeta(ws: Date) {
  return {
    weekOfYear: getWeek(ws, { weekStartsOn: 1 }),
    year: ws.getFullYear(),
  };
}

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
      const weekDays = getWeekdays(ws);
      const weekKeys = weekDays.map(toDateKey);
      const isCurrentWeek = weekKeys.includes(todayKey);
      const meta = weekMeta(ws);
      for (let di = 0; di < weekDays.length; di++) {
        const day = weekDays[di];
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
          isCurrentWeek,
          isWeekBoundaryEnd: di === weekDays.length - 1,
          weekOfYear: meta.weekOfYear,
          year: meta.year,
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
      const isCurrentWeek = weekDays.includes(todayKey);
      const meta = weekMeta(ws);
      return {
        id: startKey,
        label: format(ws, "d"),
        groupLabel: format(ws, "MMM"),
        startKey,
        endKey,
        width: colW,
        groupIndex: w,
        isToday: isCurrentWeek,
        isCurrentWeek,
        isWeekBoundaryEnd: true,
        weekOfYear: meta.weekOfYear,
        year: meta.year,
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
    const isCurrentMonth = todayKey >= monthStart && todayKey <= monthEnd;
    return {
      id: startKey,
      label: format(month, "MMM"),
      groupLabel: format(month, "yyyy"),
      startKey,
      endKey,
      width: colW,
      groupIndex: m,
      isToday: isCurrentMonth,
      isCurrentWeek: false,
      isWeekBoundaryEnd: false,
      weekOfYear: null,
      year: month.getFullYear(),
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

/** Resolve which column contains a pixel offset within the row canvas. */
export function columnAtOffsetPx(
  columns: ScheduleColumn[],
  offsetX: number,
): ScheduleColumn | null {
  if (columns.length === 0) return null;
  if (offsetX < 0) return columns[0];
  let x = 0;
  for (const col of columns) {
    const next = x + col.width;
    if (offsetX < next) return col;
    x = next;
  }
  return columns[columns.length - 1];
}

/** CSS guides for day/week separators without mounting a DOM node per column. */
export function columnGuideBackground(
  columns: ScheduleColumn[],
): { backgroundImage?: string } {
  if (columns.length === 0) return {};
  const w0 = columns[0].width;
  const uniform = columns.every((c) => c.width === w0);
  if (uniform) {
    // Day zoom: thin day lines + thicker week lines every 5 columns.
    const weekW = w0 * 5;
    return {
      backgroundImage: [
        `repeating-linear-gradient(to right, transparent 0, transparent ${w0 - 1}px, var(--schedule-day-border) ${w0 - 1}px, var(--schedule-day-border) ${w0}px)`,
        `repeating-linear-gradient(to right, transparent 0, transparent ${weekW - 2}px, var(--schedule-week-border) ${weekW - 2}px, var(--schedule-week-border) ${weekW}px)`,
      ].join(", "),
    };
  }
  const stops: string[] = [];
  let x = 0;
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    const edge = x + col.width;
    const thick = col.isWeekBoundaryEnd ? 2 : 1;
    const color = col.isWeekBoundaryEnd
      ? "var(--schedule-week-border)"
      : "var(--schedule-day-border)";
    stops.push(
      `transparent ${edge - thick}px`,
      `${color} ${edge - thick}px`,
      `${color} ${edge}px`,
      `transparent ${edge}px`,
    );
    x = edge;
  }
  return {
    backgroundImage: `linear-gradient(to right, ${stops.join(", ")})`,
  };
}
