import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isWeekend,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export function toDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function parseDateKey(key: string): Date {
  return parseISO(key);
}

export function weekStart(date: Date, weekStartsOn: 0 | 1 = 1): Date {
  return startOfWeek(date, { weekStartsOn });
}

export function weekEnd(date: Date, weekStartsOn: 0 | 1 = 1): Date {
  return endOfWeek(date, { weekStartsOn });
}

export function getWeekDays(anchor: Date, weekStartsOn: 0 | 1 = 1): Date[] {
  const start = weekStart(anchor, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Mon–Fri for a week starting at `weekStartDate`. */
export function getWeekdays(weekStartDate: Date): Date[] {
  const start = weekStart(weekStartDate);
  return Array.from({ length: 5 }, (_, i) => addDays(start, i));
}

export function getDateRange(start: Date, count: number): Date[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

/** Consecutive weekday columns across N weeks (no Sat/Sun). */
export function getWeekdayTimeline(anchor: Date, weeks: number): Date[] {
  const out: Date[] = [];
  for (let w = 0; w < weeks; w++) {
    out.push(...getWeekdays(addDays(weekStart(anchor), w * 7)));
  }
  return out;
}

/** First/last weekday keys for a calendar month. */
export function monthWorkingBounds(monthAnchor: Date): {
  startKey: string;
  endKey: string;
} {
  const start = startOfMonth(monthAnchor);
  const end = endOfMonth(monthAnchor);
  const days = eachDayOfInterval({ start, end }).filter((d) => !isWeekend(d));
  if (days.length === 0) {
    return { startKey: toDateKey(start), endKey: toDateKey(end) };
  }
  return {
    startKey: toDateKey(days[0]),
    endKey: toDateKey(days[days.length - 1]),
  };
}

export function shiftMonth(anchor: Date, delta: number): Date {
  return startOfMonth(addMonths(anchor, delta));
}

export function daysBetweenInclusive(startKey: string, endKey: string): string[] {
  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  if (end < start) return [startKey];
  return eachDayOfInterval({ start, end }).map(toDateKey);
}

export function workingDaysBetween(
  startKey: string,
  endKey: string,
  skipWeekends = true,
): string[] {
  return daysBetweenInclusive(startKey, endKey).filter((key) => {
    if (!skipWeekends) return true;
    return !isWeekend(parseDateKey(key));
  });
}

/** Advance by N weekdays (skips Sat/Sun). */
export function addWorkingDays(
  dateKey: string,
  workingDaysAhead: number,
): string {
  if (workingDaysAhead <= 0) return dateKey;
  let d = parseDateKey(dateKey);
  let left = workingDaysAhead;
  while (left > 0) {
    d = addDays(d, 1);
    if (!isWeekend(d)) left -= 1;
  }
  return toDateKey(d);
}

/** Go back by N weekdays (skips Sat/Sun). */
export function subtractWorkingDays(
  dateKey: string,
  workingDaysBack: number,
): string {
  if (workingDaysBack <= 0) return dateKey;
  let d = parseDateKey(dateKey);
  let left = workingDaysBack;
  while (left > 0) {
    d = addDays(d, -1);
    if (!isWeekend(d)) left -= 1;
  }
  return toDateKey(d);
}

/** Shift a date by N working days (negative = backward). */
export function shiftWorkingDays(dateKey: string, delta: number): string {
  if (delta === 0) return dateKey;
  if (delta > 0) return addWorkingDays(dateKey, delta);
  return subtractWorkingDays(dateKey, -delta);
}

/** Signed weekday distance from → to (0 if same day). */
export function workingDayDelta(fromKey: string, toKey: string): number {
  if (fromKey === toKey) return 0;
  if (toKey > fromKey) {
    return workingDaysBetween(fromKey, toKey).length - 1;
  }
  return -(workingDaysBetween(toKey, fromKey).length - 1);
}

export function formatShortDay(date: Date): string {
  return format(date, "EEE");
}

export function formatDayNum(date: Date): string {
  return format(date, "d");
}

export function formatWeekLabel(anchor: Date): string {
  const start = weekStart(anchor);
  const end = weekEnd(anchor);
  return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
}

export function shiftWeek(anchor: Date, delta: number): Date {
  return addDays(anchor, delta * 7);
}

export { addWeeks, addMonths, startOfMonth, endOfMonth };
