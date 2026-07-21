"use client";

import { addWeeks, format } from "date-fns";
import { useData } from "@/lib/data/store";
import {
  availableHoursInRange,
  capacityLevel,
  personBookedHoursInRange,
  utilizationPct,
} from "@/lib/domain/capacity";
import { toDateKey, weekEnd, weekStart } from "@/lib/domain/dates";
import { cn } from "@/lib/cn";

export function UtilizationHeatmap({
  weeks = 8,
  personIds,
}: {
  weeks?: number;
  /** When set, only these people are shown (member / View As scoping). */
  personIds?: string[] | null;
}) {
  const { state } = useData();
  const anchors = Array.from({ length: weeks }, (_, i) =>
    weekStart(addWeeks(new Date(), i)),
  );
  const people =
    personIds && personIds.length > 0
      ? state.people.filter((p) => personIds.includes(p.id))
      : state.people;

  return (
    <div className="overflow-auto rounded-md border border-[var(--border)]">
      <div
        className="min-w-max grid"
        style={{
          gridTemplateColumns: `160px repeat(${weeks}, minmax(72px, 1fr))`,
        }}
      >
        <div className="sticky left-0 bg-[var(--bg-elevated)] px-3 py-2 text-xs font-medium text-[var(--text-muted)]">
          People
        </div>
        {anchors.map((anchor) => (
          <div
            key={anchor.toISOString()}
            className="border-l border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-2 text-center text-[11px] text-[var(--text-muted)]"
          >
            {format(anchor, "MMM d")}
          </div>
        ))}

        {people.map((person) => (
          <div key={person.id} className="contents">
            <div className="sticky left-0 border-t border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm">
              {person.name}
            </div>
            {anchors.map((anchor) => {
              const start = toDateKey(anchor);
              const end = toDateKey(weekEnd(anchor));
              const booked = personBookedHoursInRange(
                person.id,
                start,
                end,
                state.assignments,
                state.leave_days,
              );
              const available = availableHoursInRange(
                person,
                start,
                end,
                state.leave_days,
              );
              const level = capacityLevel(booked, available, available <= 0);
              const pct = utilizationPct(booked, available);
              return (
                <div
                  key={`${person.id}-${start}`}
                  className={cn(
                    "border-l border-t border-[var(--border)] px-2 py-2 text-center text-xs",
                    level === "healthy" && "bg-[var(--status-healthy)]/20",
                    level === "near" && "bg-[var(--status-near)]/25",
                    level === "over" && "bg-[var(--status-over)]/25",
                    level === "unavailable" && "bg-[var(--status-unavailable)]/20",
                  )}
                  title={`${booked.toFixed(0)}h / ${available.toFixed(0)}h`}
                >
                  {available <= 0 ? "—" : `${Math.round(pct)}%`}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
