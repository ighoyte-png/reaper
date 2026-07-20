"use client";

import { useMemo } from "react";
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { toDateKey } from "@/lib/domain/dates";
import { leaveKindLabel } from "@/lib/domain/leave";
import type { LeaveDay, Person } from "@/lib/types";

export function LeaveMonthCalendar({
  month,
  leaveDays,
  people,
}: {
  month: Date;
  leaveDays: LeaveDay[];
  people?: Person[];
}) {
  const peopleById = useMemo(() => {
    const map = new Map<string, Person>();
    for (const p of people ?? []) map.set(p.id, p);
    return map;
  }, [people]);

  const leaveByDay = useMemo(() => {
    const map = new Map<string, LeaveDay[]>();
    for (const l of leaveDays) {
      if (l.status !== "approved") continue;
      const list = map.get(l.date) ?? [];
      list.push(l);
      map.set(l.date, list);
    }
    return map;
  }, [leaveDays]);

  const cells = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  const todayKey = toDateKey(new Date());

  return (
    <div>
      <div className="mb-2 text-xs font-medium text-[var(--text-muted)]">
        {format(month, "MMMM yyyy")}
      </div>
      <div className="grid grid-cols-7 gap-px text-center text-[10px] text-[var(--text-muted)]">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="py-1 font-medium">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day) => {
          const key = toDateKey(day);
          const inMonth = isSameMonth(day, month);
          const dayLeave = leaveByDay.get(key) ?? [];
          const count = dayLeave.length;
          const isToday = key === todayKey;

          const tipContent =
            count > 0 ? (
              <div className="space-y-1.5">
                <div className="font-medium">
                  {format(parseISO(key), "MMM d")}
                </div>
                {dayLeave.map((l) => {
                  const person = peopleById.get(l.person_id);
                  return (
                    <div key={l.id} className="space-y-0.5">
                      <div>
                        {person?.name ?? "Person"} · {leaveKindLabel(l.kind)}
                      </div>
                      {l.notes?.trim() ? (
                        <div className="text-[var(--text-muted)]">
                          {l.notes.trim()}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null;

          const cell = (
            <div
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center rounded-md text-xs",
                !inMonth && "opacity-30",
                count > 0 && inMonth
                  ? "bg-[var(--leave-block-wash)] text-[var(--leave-block-fg)]"
                  : "text-[var(--text-muted)]",
                isToday && "ring-1 ring-[var(--accent)]",
              )}
            >
              <span
                className={cn(
                  "leading-none",
                  isToday && "font-semibold text-[var(--accent)]",
                )}
              >
                {format(day, "d")}
              </span>
              {count > 0 ? (
                <span className="mt-0.5 flex gap-0.5">
                  {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                    <span
                      key={i}
                      className="h-1 w-1 rounded-full bg-[var(--leave-block)]"
                    />
                  ))}
                </span>
              ) : (
                <span className="mt-0.5 h-1" />
              )}
            </div>
          );

          return (
            <div key={key}>
              {tipContent ? (
                <Tooltip content={tipContent} className="w-full">
                  {cell}
                </Tooltip>
              ) : (
                cell
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
