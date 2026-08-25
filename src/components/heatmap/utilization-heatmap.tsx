"use client";

import { addWeeks, format } from "date-fns";
import { useEffect, useMemo } from "react";
import { PersonAvatar } from "@/components/people/person-avatar";
import { useData } from "@/lib/data/store";
import { formatHours } from "@/lib/domain/budget";
import {
  availableHoursInRange,
  buildBookedHoursByPersonDay,
  capacityLevel,
  capacityLevelTextClass,
  capacityLevelWashClass,
  projectEndLookupFromProjects,
  sumBookedHoursFromDayMap,
  utilizationPct,
} from "@/lib/domain/capacity";
import { toDateKey, weekEnd, weekStart } from "@/lib/domain/dates";
import { utilizationVisiblePeople, personAvatarColor } from "@/lib/domain/people";
import { expandAssignmentsInRange } from "@/lib/domain/recurrence";
import { sortPeopleByName } from "@/lib/domain/sorting";
import { cn } from "@/lib/cn";
import { useIsPhone } from "@/lib/hooks/use-media-query";
import type { CapacityLevel } from "@/lib/types";
import {
  capacityLegendItems,
  capacityThresholdsFromSettings,
} from "@/lib/domain/org-settings";

function levelTone(level: CapacityLevel) {
  return {
    border: "border-transparent",
    fill: capacityLevelWashClass(level),
    text: capacityLevelTextClass(level),
    chip: cn("border-transparent", capacityLevelTextClass(level)),
  };
}

function UtilizationPill({
  booked,
  available,
  thresholds,
}: {
  booked: number;
  available: number;
  thresholds?: ReturnType<typeof capacityThresholdsFromSettings>;
}) {
  const level = capacityLevel(
    booked,
    available,
    available <= 0,
    thresholds,
  );
  const pct = utilizationPct(booked, available);
  const tone = levelTone(level);
  const fillPct = available <= 0 ? 0 : Math.min(100, Math.max(0, pct));

  return (
    <div
      className={cn(
        "relative flex h-8 items-center justify-center overflow-hidden rounded-md border",
        tone.border,
      )}
      title={
        available <= 0
          ? "Unavailable"
          : `${Math.round(pct)}% · ${formatHours(booked)} booked / ${formatHours(available)} available`
      }
    >
      <div
        className={cn("absolute inset-y-0 left-0", tone.fill)}
        style={{ width: `${fillPct}%` }}
      />
      <span
        className={cn(
          "relative z-[1] text-[11px] font-semibold tabular-nums",
          tone.text,
        )}
      >
        {available <= 0
          ? "—"
          : `${Math.round(pct)}% · ${formatHours(booked)}`}
      </span>
    </div>
  );
}

export function UtilizationHeatmap({
  weeks = 8,
  personIds,
  showLegend = true,
  showTeamAverage = false,
  teamAverageLabel = "Team Utilization",
}: {
  weeks?: number;
  /** When set, only these people are shown (member / View As scoping). */
  personIds?: string[] | null;
  showLegend?: boolean;
  /** Footer row with combined booked/available across all shown people. */
  showTeamAverage?: boolean;
  /** Label for the pooled utilization footer row. */
  teamAverageLabel?: string;
}) {
  const { state, mode, ensureScheduleRange } = useData();
  const isPhone = useIsPhone();
  const anchors = useMemo(
    () =>
      Array.from({ length: weeks }, (_, i) =>
        weekStart(addWeeks(new Date(), i)),
      ),
    [weeks],
  );
  const people = sortPeopleByName(
    personIds == null
      ? utilizationVisiblePeople(state.people)
      : utilizationVisiblePeople(
          state.people.filter((p) => personIds.includes(p.id)),
        ),
  );

  const rangeStart = toDateKey(anchors[0]!);
  const rangeEnd = toDateKey(weekEnd(anchors[anchors.length - 1]!));
  const projectEndById = useMemo(
    () => projectEndLookupFromProjects(state.projects),
    [state.projects],
  );

  // Same assignment expand + day map as Schedule (incl. project end clipping).
  const bookedHoursByPersonDay = useMemo(() => {
    const occurrences = expandAssignmentsInRange(
      state.assignments,
      rangeStart,
      rangeEnd,
      projectEndById,
    );
    return buildBookedHoursByPersonDay(occurrences, state.leave_days);
  }, [state.assignments, state.leave_days, rangeStart, rangeEnd, projectEndById]);

  // Same assignment window as schedule — client math must see every row
  // (including sandbox). Do not overwrite with rpc_person_utilization_weeks,
  // which undercounts vs schedule (e.g. excludes sandbox projects).
  useEffect(() => {
    if (mode !== "supabase") return;
    void ensureScheduleRange(rangeStart, rangeEnd);
  }, [mode, ensureScheduleRange, rangeStart, rangeEnd]);

  const thresholds = capacityThresholdsFromSettings(
    state.organization_settings,
  );

  return (
    <div className="space-y-3">
      {showLegend ? (
        <div className="flex flex-wrap items-center gap-2">
          {capacityLegendItems(thresholds).map((item) => {
            const tone = levelTone(item.level);
            return (
              <span
                key={item.level}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]",
                  tone.chip,
                )}
              >
                <span className="font-semibold tabular-nums">{item.range}</span>
                <span className="text-[var(--text-muted)]">{item.label}</span>
              </span>
            );
          })}
        </div>
      ) : null}

      <div className="min-w-0 overflow-auto rounded-md border border-[var(--border)] bg-[var(--bg)]">
        <div
          className="min-w-max grid"
          style={{
            gridTemplateColumns: isPhone
              ? `7.5rem repeat(${weeks}, minmax(4.5rem, 1fr))`
              : `200px repeat(${weeks}, minmax(104px, 1fr))`,
          }}
        >
          <div className="sticky left-0 z-[1] bg-[var(--bg)] px-3 py-2.5 text-xs font-medium text-[var(--text-muted)]">
            People
          </div>
          {anchors.map((anchor) => (
            <div
              key={anchor.toISOString()}
              className="border-l border-[var(--border)] bg-[var(--bg)] px-2 py-2.5 text-center text-[11px] font-medium text-[var(--text-muted)]"
            >
              {format(anchor, "MMM d")}
            </div>
          ))}

          {people.map((person) => (
            <div key={person.id} className="contents">
              <div className="sticky left-0 z-[1] flex items-center gap-2.5 border-t border-[var(--border)] bg-[var(--bg)] px-3 py-2.5">
                <PersonAvatar
                  avatarUrl={person.avatar_url}
                  avatarAttachmentId={person.avatar_attachment_id}
                  name={person.name}
                  size="row"
                  fallback="initials"
                  personId={person.id}
                  color={personAvatarColor(person)}
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium leading-tight">
                    {person.name}
                  </div>
                  <div className="truncate text-[11px] text-[var(--text-muted)]">
                    {person.role_title || "—"}
                  </div>
                </div>
              </div>
              {anchors.map((anchor) => {
                const start = toDateKey(anchor);
                const end = toDateKey(weekEnd(anchor));
                const booked = sumBookedHoursFromDayMap(
                  bookedHoursByPersonDay.get(person.id),
                  start,
                  end,
                  person.id,
                  state.leave_days,
                );
                const available = availableHoursInRange(
                  person,
                  start,
                  end,
                  state.leave_days,
                );
                return (
                  <div
                    key={`${person.id}-${start}`}
                    className="border-l border-t border-[var(--border)] px-2 py-2"
                  >
                    <UtilizationPill
                      booked={booked}
                      available={available}
                      thresholds={thresholds}
                    />
                  </div>
                );
              })}
            </div>
          ))}

          {showTeamAverage && people.length > 0 ? (
            <div className="contents">
              <div className="sticky left-0 z-[1] flex items-center border-t-4 border-[var(--border)] bg-[var(--bg)] px-3 py-2.5">
                <div className="truncate text-sm font-semibold leading-tight">
                  {teamAverageLabel}
                </div>
              </div>
              {anchors.map((anchor) => {
                const start = toDateKey(anchor);
                const end = toDateKey(weekEnd(anchor));
                let booked = 0;
                let available = 0;
                for (const person of people) {
                  booked += sumBookedHoursFromDayMap(
                    bookedHoursByPersonDay.get(person.id),
                    start,
                    end,
                    person.id,
                    state.leave_days,
                  );
                  available += availableHoursInRange(
                    person,
                    start,
                    end,
                    state.leave_days,
                  );
                }
                return (
                  <div
                    key={`team-${start}`}
                    className="border-l border-t-4 border-[var(--border)] px-2 py-2"
                  >
                    <UtilizationPill
                      booked={booked}
                      available={available}
                      thresholds={thresholds}
                    />
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
