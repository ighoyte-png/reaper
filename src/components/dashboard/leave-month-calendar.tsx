"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  addYears,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isWeekend,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { RichNotesHtml } from "@/components/ui/simple-rich-text";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { toDateKey } from "@/lib/domain/dates";
import { leaveKindLabel } from "@/lib/domain/leave";
import { notesHasContent } from "@/lib/notes-html";
import type { LeaveDay, Person } from "@/lib/types";

export function LeaveMonthCalendar({
  leaveDays,
  people,
  initialMonth,
}: {
  leaveDays: LeaveDay[];
  people?: Person[];
  /** Defaults to the current month. */
  initialMonth?: Date;
}) {
  const [month, setMonth] = useState(() =>
    startOfMonth(initialMonth ?? new Date()),
  );

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
    return eachDayOfInterval({ start, end }).filter((d) => !isWeekend(d));
  }, [month]);

  const todayKey = toDateKey(new Date());
  const thisMonth = startOfMonth(new Date());
  const isCurrentMonth = isSameMonth(month, thisMonth);

  return (
    <div>
      <div className="mb-2 flex items-center gap-0.5">
        <button
          type="button"
          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
          aria-label="Previous year"
          title="Previous year"
          onClick={() => setMonth((m) => startOfMonth(addYears(m, -1)))}
        >
          <ChevronsLeft size={15} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
          aria-label="Previous month"
          title="Previous month"
          onClick={() => setMonth((m) => startOfMonth(addMonths(m, -1)))}
        >
          <ChevronLeft size={16} strokeWidth={2} />
        </button>
        <div className="min-w-0 flex-1 text-center text-xs font-medium text-[var(--text)]">
          {format(month, "MMMM yyyy")}
        </div>
        <button
          type="button"
          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
          aria-label="Next month"
          title="Next month"
          onClick={() => setMonth((m) => startOfMonth(addMonths(m, 1)))}
        >
          <ChevronRight size={16} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
          aria-label="Next year"
          title="Next year"
          onClick={() => setMonth((m) => startOfMonth(addYears(m, 1)))}
        >
          <ChevronsRight size={15} strokeWidth={2} />
        </button>
      </div>
      {!isCurrentMonth ? (
        <div className="mb-2 flex justify-center">
          <button
            type="button"
            className="cursor-pointer text-[11px] text-[var(--accent)] hover:underline"
            onClick={() => setMonth(thisMonth)}
          >
            Today
          </button>
        </div>
      ) : null}
      <div className="grid grid-cols-5 gap-px text-center text-[10px] text-[var(--text-muted)]">
        {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => (
          <div key={d} className="py-1 font-medium">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1">
        {cells.map((day) => {
          const key = toDateKey(day);
          const inMonth = isSameMonth(day, month);
          const dayLeave = leaveByDay.get(key) ?? [];
          const count = dayLeave.length;
          const isToday = key === todayKey;
          const hasLeave = count > 0 && inMonth;

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
                      {notesHasContent(l.notes) ? (
                        <RichNotesHtml
                          html={l.notes}
                          className="text-[var(--text-muted)]"
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null;

          const cell = (
            <div
              className={cn(
                "relative flex w-full flex-col items-center justify-center rounded-md px-0.5 py-1.5 text-xs",
                !inMonth && "opacity-30",
                isToday
                  ? "bg-[var(--today-col)] text-[var(--text)]"
                  : hasLeave
                    ? "bg-[var(--leave-block-fill)] text-[var(--leave-block-fg)]"
                    : "text-[var(--text-muted)]",
              )}
            >
              <span
                className={cn(
                  "leading-none",
                  isToday && "font-semibold text-[var(--accent)]",
                  hasLeave && !isToday && "font-medium",
                )}
              >
                {format(day, "d")}
              </span>
              <span className="mt-1 flex h-1 items-center justify-center gap-0.5">
                {hasLeave
                  ? Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                      <span
                        key={i}
                        className="h-1 w-1 rounded-full bg-[var(--leave-block)]"
                      />
                    ))
                  : null}
              </span>
            </div>
          );

          return (
            <div key={key} className="min-w-0">
              {tipContent ? (
                <Tooltip content={tipContent} className="block w-full">
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
