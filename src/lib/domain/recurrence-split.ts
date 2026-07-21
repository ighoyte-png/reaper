import { parseISO } from "date-fns";
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
