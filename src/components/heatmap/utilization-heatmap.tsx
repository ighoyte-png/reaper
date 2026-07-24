"use client";

import { addWeeks, format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { PersonAvatar } from "@/components/people/person-avatar";
import { useData } from "@/lib/data/store";
import {
  availableHoursInRange,
  capacityLevel,
  personBookedHoursInRange,
  utilizationPct,
} from "@/lib/domain/capacity";
import { toDateKey, weekEnd, weekStart } from "@/lib/domain/dates";
import { sortPeopleByName } from "@/lib/domain/sorting";
import { cn } from "@/lib/cn";
import type { CapacityLevel } from "@/lib/types";

const LEGEND: {
  level: CapacityLevel;
  range: string;
  label: string;
}[] = [
  { level: "over", range: "100%+", label: "Overbooked" },
  { level: "near", range: "85-99%", label: "Near Capacity" },
  { level: "healthy", range: "40-84%", label: "Optimal" },
  { level: "low", range: "<40%", label: "Available / Out" },
];

function levelTone(level: CapacityLevel) {
  switch (level) {
    case "over":
      return {
        border: "border-transparent",
        fill: "bg-[var(--status-over)]/25",
        text: "text-[var(--status-over)]",
        chip: "border-transparent text-[var(--status-over)]",
      };
    case "near":
      return {
        border: "border-transparent",
        fill: "bg-[var(--status-near)]/25",
        text: "text-[var(--status-near)]",
        chip: "border-transparent text-[var(--status-near)]",
      };
    case "healthy":
      return {
        border: "border-transparent",
        fill: "bg-[var(--status-healthy)]/25",
        text: "text-[var(--status-healthy)]",
        chip: "border-transparent text-[var(--status-healthy)]",
      };
    case "low":
    case "unavailable":
    default:
      return {
        border: "border-transparent",
        fill: "bg-[var(--status-unavailable)]/20",
        text: "text-[var(--text-muted)]",
        chip: "border-transparent text-[var(--text-muted)]",
      };
  }
}

function UtilizationPill({
  booked,
  available,
}: {
  booked: number;
  available: number;
}) {
  const level = capacityLevel(booked, available, available <= 0);
  const pct = utilizationPct(booked, available);
  const tone = levelTone(level);
  const fillPct = available <= 0 ? 0 : Math.min(100, Math.max(0, pct));

  return (
    <div
      className={cn(
        "relative flex h-8 items-center justify-center overflow-hidden rounded-md border",
        tone.border,
      )}
      title={`${booked.toFixed(0)}h / ${available.toFixed(0)}h`}
    >
      <div
        className={cn("absolute inset-y-0 left-0", tone.fill)}
        style={{ width: `${fillPct}%` }}
      />
      <span
        className={cn(
          "relative z-[1] text-xs font-semibold tabular-nums",
          tone.text,
        )}
      >
        {available <= 0 ? "—" : `${Math.round(pct)}%`}
      </span>
    </div>
  );
}

type CellHours = { booked: number; available: number };

export function UtilizationHeatmap({
  weeks = 8,
  personIds,
  showLegend = true,
  showTeamAverage = false,
}: {
  weeks?: number;
  /** When set, only these people are shown (member / View As scoping). */
  personIds?: string[] | null;
  showLegend?: boolean;
  /** Footer row with combined booked/available across all shown people. */
  showTeamAverage?: boolean;
}) {
  const {
    state,
    mode,
    fetchPersonUtilizationWeeksRpc,
    ensureOrgHeavyData,
  } = useData();
  const anchors = useMemo(
    () =>
      Array.from({ length: weeks }, (_, i) =>
        weekStart(addWeeks(new Date(), i)),
      ),
    [weeks],
  );
  const people = sortPeopleByName(
    personIds && personIds.length > 0
      ? state.people.filter((p) => personIds.includes(p.id))
      : state.people,
  );

  const [rpcCells, setRpcCells] = useState<Map<string, CellHours> | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (mode === "demo") {
        setRpcCells(null);
        return;
      }
      const weekStartKey = toDateKey(anchors[0]!);
      const ids =
        personIds && personIds.length > 0
          ? personIds
          : state.people.map((p) => p.id);
      const rows = await fetchPersonUtilizationWeeksRpc(
        weekStartKey,
        weeks,
        ids,
      );
      if (cancelled) return;
      if (rows) {
        const map = new Map<string, CellHours>();
        for (const row of rows) {
          const ws =
            typeof row.week_start === "string"
              ? row.week_start.slice(0, 10)
              : String(row.week_start);
          map.set(`${row.person_id}:${ws}`, {
            booked: row.booked_hours,
            available: row.available_hours,
          });
        }
        setRpcCells(map);
        return;
      }
      try {
        await ensureOrgHeavyData();
      } catch {
        /* soft-fail → client math */
      }
      if (!cancelled) setRpcCells(null);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [
    mode,
    weeks,
    anchors,
    personIds,
    state.people,
    fetchPersonUtilizationWeeksRpc,
    ensureOrgHeavyData,
  ]);

  return (
    <div className="space-y-3">
      {showLegend ? (
        <div className="flex flex-wrap items-center gap-2">
          {LEGEND.map((item) => {
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

      <div className="overflow-auto rounded-md border border-[var(--border)] bg-[var(--bg)]">
        <div
          className="min-w-max grid"
          style={{
            gridTemplateColumns: `200px repeat(${weeks}, minmax(88px, 1fr))`,
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
                  name={person.name}
                  size="row"
                  fallback="initials"
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
                const rpc = rpcCells?.get(`${person.id}:${start}`);
                const booked =
                  rpc?.booked ??
                  personBookedHoursInRange(
                    person.id,
                    start,
                    end,
                    state.assignments,
                    state.leave_days,
                  );
                const available =
                  rpc?.available ??
                  availableHoursInRange(
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
                    <UtilizationPill booked={booked} available={available} />
                  </div>
                );
              })}
            </div>
          ))}

          {showTeamAverage && people.length > 0 ? (
            <div className="contents">
              <div className="sticky left-0 z-[1] flex items-center border-t-4 border-[var(--border)] bg-[var(--bg)] px-3 py-2.5">
                <div className="truncate text-sm font-semibold leading-tight">
                  Team Utilization
                </div>
              </div>
              {anchors.map((anchor) => {
                const start = toDateKey(anchor);
                const end = toDateKey(weekEnd(anchor));
                let booked = 0;
                let available = 0;
                for (const person of people) {
                  const rpc = rpcCells?.get(`${person.id}:${start}`);
                  booked +=
                    rpc?.booked ??
                    personBookedHoursInRange(
                      person.id,
                      start,
                      end,
                      state.assignments,
                      state.leave_days,
                    );
                  available +=
                    rpc?.available ??
                    availableHoursInRange(
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
                    <UtilizationPill booked={booked} available={available} />
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
