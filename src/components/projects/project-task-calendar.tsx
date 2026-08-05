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
import { cn } from "@/lib/cn";
import { toDateKey } from "@/lib/domain/dates";
import type { Task } from "@/lib/types";

const MAX_VISIBLE_BARS = 2;

type CalendarTask = Task & { tone: string };

function calendarTaskTone(
  task: Pick<Task, "status" | "due_date" | "is_divider">,
  todayKey: string,
): string | null {
  if (task.is_divider || task.status === "complete") return null;
  if (!task.due_date) return null;
  if (task.due_date < todayKey) return "var(--status-over)";
  if (task.status === "active") return "var(--task-active-fg)";
  if (task.status === "upcoming") return "var(--accent)";
  return null;
}

export function ProjectTaskCalendar({
  tasks,
  todayKey = toDateKey(new Date()),
}: {
  tasks: Task[];
  todayKey?: string;
}) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => new Set());

  const tasksByDay = useMemo(() => {
    const map = new Map<string, CalendarTask[]>();
    for (const task of tasks) {
      const tone = calendarTaskTone(task, todayKey);
      if (!tone || !task.due_date) continue;
      const list = map.get(task.due_date) ?? [];
      list.push({ ...task, tone });
      map.set(task.due_date, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.title.localeCompare(b.title));
    }
    return map;
  }, [tasks, todayKey]);

  const cells = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  const thisMonth = startOfMonth(new Date());
  const isCurrentMonth = isSameMonth(month, thisMonth);

  function toggleExpanded(dayKey: string) {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dayKey)) next.delete(dayKey);
      else next.add(dayKey);
      return next;
    });
  }

  return (
    <div className="w-full min-w-0">
      <div className="mb-3 flex items-center gap-0.5">
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
        <div className="min-w-0 flex-1 text-center text-sm font-medium text-[var(--text)]">
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
      <div className="grid grid-cols-7 gap-px text-center text-[10px] font-medium text-[var(--text-muted)]">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day) => {
          const key = toDateKey(day);
          const inMonth = isSameMonth(day, month);
          const dayTasks = tasksByDay.get(key) ?? [];
          const expanded = expandedDays.has(key);
          const visible = expanded
            ? dayTasks
            : dayTasks.slice(0, MAX_VISIBLE_BARS);
          const overflow = expanded ? 0 : dayTasks.length - visible.length;
          const isToday = key === todayKey;

          return (
            <div
              key={key}
              className={cn(
                "flex min-h-[5.5rem] min-w-0 flex-col rounded-md border border-transparent p-1",
                !inMonth && "opacity-40",
                isToday && "border-[var(--accent)]/30 bg-[var(--today-col)]",
              )}
            >
              <div
                className={cn(
                  "mb-1 text-right text-[11px] tabular-nums",
                  isToday
                    ? "font-semibold text-[var(--accent)]"
                    : "text-[var(--text-muted)]",
                )}
              >
                {format(day, "d")}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                {visible.map((task) => (
                  <div
                    key={task.id}
                    className="w-full truncate rounded px-1 py-0.5 text-[10px] font-medium leading-tight text-white"
                    style={{ backgroundColor: task.tone }}
                    title={task.title}
                  >
                    {task.title}
                  </div>
                ))}
                {overflow > 0 ? (
                  <button
                    type="button"
                    className="mt-auto w-fit cursor-pointer rounded-full bg-[var(--status-attention)] px-2 py-0.5 text-[11px] font-medium text-white hover:opacity-90"
                    onClick={() => toggleExpanded(key)}
                    aria-expanded={false}
                    aria-label={`Show ${overflow} more tasks on ${format(parseISO(key), "MMM d")}`}
                  >
                    +{overflow}
                  </button>
                ) : expanded && dayTasks.length > MAX_VISIBLE_BARS ? (
                  <button
                    type="button"
                    className="mt-auto w-fit cursor-pointer text-[10px] text-[var(--accent)] hover:underline"
                    onClick={() => toggleExpanded(key)}
                  >
                    Show less
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
