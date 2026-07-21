import { addDays, addWeeks, differenceInCalendarWeeks, parseISO } from "date-fns";
import type { Assignment } from "@/lib/types";
import { toDateKey, weekStart } from "@/lib/domain/dates";

/** Monday date key for the week containing `occurrenceStart`. */
export function occurrenceExceptionKey(occurrenceStart: string): string {
  return toDateKey(weekStart(parseISO(occurrenceStart)));
}

/** Append an exception week to a series (no-op if already present). */
export function withRecurrenceException(
  series: Assignment,
  occurrenceStart: string,
): Assignment {
  const key = occurrenceExceptionKey(occurrenceStart);
  const existing = series.recurrence_exceptions ?? [];
  if (existing.includes(key)) return { ...series };
  return {
    ...series,
    recurrence_exceptions: [...existing, key],
  };
}

function weekOffsetOf(series: Assignment, occurrenceStart: string): number {
  const templateWeek = weekStart(parseISO(series.start_date));
  const occWeek = weekStart(parseISO(occurrenceStart));
  return differenceInCalendarWeeks(occWeek, templateWeek, { weekStartsOn: 1 });
}

/** End the series the working day before this occurrence (past weeks remain). */
export function endWeeklySeriesBeforeOccurrence(
  series: Assignment,
  occurrenceStart: string,
): Assignment | null {
  if (weekOffsetOf(series, occurrenceStart) <= 0) return null;
  const occWeek = weekStart(parseISO(occurrenceStart));
  return {
    ...series,
    recurrence_end_date: toDateKey(addDays(occWeek, -1)),
  };
}

/**
 * Detach one week from a weekly series without splitting the series into
 * multiple rows. The original series keeps a single id; that week is listed
 * in `recurrence_exceptions`, and a standalone (non-recurring) assignment
 * holds the edited instance.
 */
export function splitWeeklySeriesForInstance(args: {
  series: Assignment;
  /** Occurrence dates before the edit (the week being singled out). */
  occurrenceStart: string;
  occurrenceEnd: string;
  /** Desired standalone assignment (dates/hours/etc). */
  instance: Omit<Assignment, "id" | "organization_id"> & {
    id?: string;
    organization_id?: string;
  };
  newId: (prefix: string) => string;
  organizationId: string;
}): {
  /** Same series id, with this week excluded. */
  keepSeries: Assignment;
  /** Always null — future weeks stay on keepSeries. */
  continuation: Assignment | null;
  /** The one-off instance. */
  instance: Assignment;
} {
  const { series, occurrenceStart, occurrenceEnd, newId, organizationId } =
    args;
  void occurrenceEnd;

  const instance: Assignment = {
    ...args.instance,
    id: newId("asg"),
    organization_id: args.instance.organization_id ?? organizationId,
    recurrence: "none",
    recurrence_end_date: null,
    recurrence_exceptions: [],
  };

  return {
    keepSeries: withRecurrenceException(series, occurrenceStart),
    continuation: null,
    instance,
  };
}

/**
 * Apply an edit to this occurrence and all future weeks. Past weeks stay on
 * the original series (trimmed). When the edited week is the first, the
 * original row is updated in place.
 */
export function splitWeeklySeriesForFuture(args: {
  series: Assignment;
  occurrenceStart: string;
  occurrenceEnd: string;
  /**
   * Desired fields for the continuing series. `start_date` / `end_date` should
   * be the new template for this occurrence (first week of the continuation).
   */
  future: Omit<Assignment, "id" | "organization_id"> & {
    id?: string;
    organization_id?: string;
  };
  newId: (prefix: string) => string;
  organizationId: string;
}): {
  /** Past-only series, or null when the edit starts at week 0 (in-place). */
  keepSeries: Assignment | null;
  futureSeries: Assignment;
} {
  const {
    series,
    occurrenceStart,
    occurrenceEnd,
    future,
    newId,
    organizationId,
  } = args;
  void occurrenceEnd;

  const offset = weekOffsetOf(series, occurrenceStart);
  const occWeekKey = occurrenceExceptionKey(occurrenceStart);
  const futureWeekKey = occurrenceExceptionKey(future.start_date);
  const weekDelta = differenceInCalendarWeeks(
    weekStart(parseISO(futureWeekKey)),
    weekStart(parseISO(occWeekKey)),
    { weekStartsOn: 1 },
  );

  const endDateEdited =
    (future.recurrence_end_date ?? null) !==
    (series.recurrence_end_date ?? null);
  let recurrenceEnd = future.recurrence_end_date ?? null;
  if (!endDateEdited && series.recurrence_end_date && weekDelta !== 0) {
    recurrenceEnd = toDateKey(
      addWeeks(parseISO(series.recurrence_end_date), weekDelta),
    );
  }

  const futureExceptions = (series.recurrence_exceptions ?? [])
    .filter((key) => key > occWeekKey)
    .map((key) =>
      weekDelta === 0 ? key : toDateKey(addWeeks(parseISO(key), weekDelta)),
    );

  const futureSeriesBase: Assignment = {
    ...series,
    ...future,
    organization_id: future.organization_id ?? organizationId,
    recurrence: "weekly",
    recurrence_end_date: recurrenceEnd,
    recurrence_exceptions: futureExceptions,
    start_date: future.start_date,
    end_date: future.end_date,
  };

  if (offset <= 0) {
    return {
      keepSeries: null,
      futureSeries: {
        ...futureSeriesBase,
        id: series.id,
      },
    };
  }

  const keepSeries = endWeeklySeriesBeforeOccurrence(series, occurrenceStart);
  return {
    keepSeries,
    futureSeries: {
      ...futureSeriesBase,
      id: newId("asg"),
    },
  };
}
