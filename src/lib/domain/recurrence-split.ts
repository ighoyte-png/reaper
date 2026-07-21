import { addDays, addWeeks, differenceInCalendarWeeks, parseISO } from "date-fns";
import type { Assignment } from "@/lib/types";
import { toDateKey, weekStart } from "@/lib/domain/dates";

/**
 * Split a weekly series around one occurrence so that occurrence can become
 * a standalone (non-recurring) assignment. Returns rows to upsert (and which
 * original id to keep vs replace).
 *
 * The one-off instance always gets a new id so it never overwrites the
 * truncated past series (keepSeries), which retains the original series id.
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
  /** Series row to keep (trimmed or shifted). Null if series should be deleted. */
  keepSeries: Assignment | null;
  /** Optional continuation of the weekly series after the instance. */
  continuation: Assignment | null;
  /** The one-off instance. */
  instance: Assignment;
} {
  const { series, occurrenceStart, occurrenceEnd, newId, organizationId } =
    args;
  const instance: Assignment = {
    ...args.instance,
    // Never reuse the series id — that would overwrite keepSeries on upsert.
    id: newId("asg"),
    organization_id: args.instance.organization_id ?? organizationId,
    recurrence: "none",
    recurrence_end_date: null,
  };

  const templateWeek = weekStart(parseISO(series.start_date));
  const occWeek = weekStart(parseISO(occurrenceStart));
  const weekOffset = differenceInCalendarWeeks(occWeek, templateWeek, {
    weekStartsOn: 1,
  });

  const dayBeforeOccWeek = toDateKey(addDays(occWeek, -1));
  const nextWeekTemplateStart = toDateKey(
    addWeeks(parseISO(series.start_date), weekOffset + 1),
  );
  const nextWeekTemplateEnd = toDateKey(
    addWeeks(parseISO(series.end_date), weekOffset + 1),
  );

  const seriesEnd = series.recurrence_end_date;
  const continuesAfter =
    !seriesEnd || seriesEnd >= nextWeekTemplateStart;

  let keepSeries: Assignment | null = null;
  let continuation: Assignment | null = null;

  if (weekOffset <= 0) {
    // Instance is the first week — shift series forward one week.
    if (continuesAfter) {
      keepSeries = {
        ...series,
        start_date: nextWeekTemplateStart,
        end_date: nextWeekTemplateEnd,
      };
    } else {
      keepSeries = null;
    }
  } else {
    // End original series before this occurrence's week.
    keepSeries = {
      ...series,
      recurrence_end_date: dayBeforeOccWeek,
    };
    if (continuesAfter) {
      continuation = {
        ...series,
        id: newId("asg"),
        organization_id: organizationId,
        start_date: nextWeekTemplateStart,
        end_date: nextWeekTemplateEnd,
        recurrence: "weekly",
        recurrence_end_date: seriesEnd,
      };
    }
  }

  // Guard: unused occurrenceEnd kept for API clarity / future use
  void occurrenceEnd;

  return { keepSeries, continuation, instance };
}
