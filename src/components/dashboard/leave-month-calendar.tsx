"use client";

import { useMemo } from "react";
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { cn } from "@/lib/cn";
import { toDateKey } from "@/lib/domain/dates";
import type { LeaveDay } from "@/lib/types";

export function LeaveMonthCalendar({
  month,
  leaveDays,
}: {
  month: Date;
  leaveDays: LeaveDay[];
}) {
  const leaveByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of leaveDays) {
      if (l.status !== "approved") continue;
      map.set(l.date, (map.get(l.date) ?? 0) + 1);
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
          const count = leaveByDay.get(key) ?? 0;
          const isToday = key === todayKey;
          return (
            <div
              key={key}
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center rounded-md text-xs",
                !inMonth && "opacity-30",
                count > 0 && inMonth
                  ? "bg-[var(--leave-block-wash)] text-[var(--leave-block-fg)]"
                  : "text-[var(--text-muted)]",
                isToday && "ring-1 ring-[var(--accent)]",
              )}
              title={
                count > 0
                  ? `${format(day, "MMM d")}: ${count} on leave`
                  : format(day, "MMM d")
              }
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
        })}
      </div>
    </div>
  );
}
