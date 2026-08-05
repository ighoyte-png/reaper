"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  addWeeks,
  addYears,
  endOfMonth,
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
  Star,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { getWeekdays, toDateKey } from "@/lib/domain/dates";
import {
  isClientReviewApproved,
  isClientReviewOpen,
  listDisplayOrder,
  taskVisualTone,
  taskVisualToneColor,
} from "@/lib/domain/tasks";
import type { Task } from "@/lib/types";

const MAX_VISIBLE_LANES = 2;
const BAR_H = 18;
const LANE_GAP = 2;
const DAY_HEADER_H = 22;

type CalendarTask = Task & {
  tone: string;
  showCrStar: boolean;
  spanStart: string;
  spanEnd: string;
};

type WeekSpan = {
  task: CalendarTask;
  startCol: number;
  endCol: number;
  lane: number;
};

function calendarTaskTone(
  task: Task,
  orderedListTasks: Task[],
  todayKey: string,
): string | null {
  if (task.is_divider) return null;
  const visualTone = taskVisualTone(task, orderedListTasks);
  const crColor = taskVisualToneColor(visualTone);
  if (crColor) return crColor;
  if (task.status === "complete") return null;
  const end = task.due_date ?? task.start_date;
  if (!end) return null;
  if (end < todayKey) return "var(--status-over)";
  if (task.status === "active") return "var(--task-active-fg)";
  if (task.status === "upcoming") return "var(--accent)";
  return null;
}

function taskSpanKeys(task: Task): { start: string; end: string } | null {
  if (task.due_date && task.start_date) {
    return task.start_date <= task.due_date
      ? { start: task.start_date, end: task.due_date }
      : { start: task.due_date, end: task.start_date };
  }
  if (task.due_date) return { start: task.due_date, end: task.due_date };
  if (task.start_date) return { start: task.start_date, end: task.start_date };
  return null;
}

/** Pack non-overlapping spans into lanes (greedy by start col). */
function packLanes(spans: Omit<WeekSpan, "lane">[]): WeekSpan[] {
  const sorted = [...spans].sort(
    (a, b) =>
      a.startCol - b.startCol ||
      b.endCol - b.startCol - (a.endCol - a.startCol) ||
      a.task.title.localeCompare(b.task.title),
  );
  const laneEnds: number[] = [];
  const out: WeekSpan[] = [];
  for (const span of sorted) {
    let lane = laneEnds.findIndex((end) => end < span.startCol);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(span.endCol);
    } else {
      laneEnds[lane] = span.endCol;
    }
    out.push({ ...span, lane });
  }
  return out;
}

export function ProjectTaskCalendar({
  tasks,
  todayKey = toDateKey(new Date()),
}: {
  tasks: Task[];
  todayKey?: string;
}) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(
    () => new Set(),
  );

  const orderedByList = useMemo(() => {
    const map = new Map<string, Task[]>();
    const listIds = new Set(tasks.map((t) => t.list_id));
    for (const listId of listIds) {
      map.set(
        listId,
        listDisplayOrder(tasks.filter((t) => t.list_id === listId)),
      );
    }
    return map;
  }, [tasks]);

  const calendarTasks = useMemo(() => {
    const list: CalendarTask[] = [];
    for (const task of tasks) {
      const ordered = orderedByList.get(task.list_id) ?? [];
      const tone = calendarTaskTone(task, ordered, todayKey);
      const span = taskSpanKeys(task);
      if (!tone || !span) continue;
      list.push({
        ...task,
        tone,
        showCrStar: isClientReviewOpen(task) || isClientReviewApproved(task),
        spanStart: span.start,
        spanEnd: span.end,
      });
    }
    list.sort((a, b) => a.title.localeCompare(b.title));
    return list;
  }, [tasks, todayKey, orderedByList]);

  const weeks = useMemo(() => {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    const firstWeek = startOfWeek(monthStart, { weekStartsOn: 1 });
    const lastWeek = startOfWeek(monthEnd, { weekStartsOn: 1 });
    const out: { weekKey: string; days: Date[] }[] = [];
    for (
      let cursor = firstWeek;
      cursor <= lastWeek;
      cursor = addWeeks(cursor, 1)
    ) {
      out.push({
        weekKey: toDateKey(cursor),
        days: getWeekdays(cursor),
      });
    }
    return out;
  }, [month]);

  const weeksWithSpans = useMemo(() => {
    return weeks.map(({ weekKey, days }) => {
      const dayKeys = days.map(toDateKey);
      const weekStartKey = dayKeys[0]!;
      const weekEndKey = dayKeys[4]!;
      const raw: Omit<WeekSpan, "lane">[] = [];
      for (const task of calendarTasks) {
        if (task.spanEnd < weekStartKey || task.spanStart > weekEndKey) {
          continue;
        }
        let startCol = 0;
        while (startCol < 5 && dayKeys[startCol]! < task.spanStart) {
          startCol += 1;
        }
        let endCol = 4;
        while (endCol >= 0 && dayKeys[endCol]! > task.spanEnd) {
          endCol -= 1;
        }
        if (startCol > endCol) continue;
        raw.push({ task, startCol, endCol });
      }
      return { weekKey, days, dayKeys, spans: packLanes(raw) };
    });
  }, [weeks, calendarTasks]);

  const thisMonth = startOfMonth(new Date());
  const isCurrentMonth = isSameMonth(month, thisMonth);

  function toggleWeekExpanded(weekKey: string) {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(weekKey)) next.delete(weekKey);
      else next.add(weekKey);
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

      <div className="grid grid-cols-5 gap-px text-center text-[10px] font-medium text-[var(--text-muted)]">
        {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        {weeksWithSpans.map(({ weekKey, days, spans }) => {
          const expanded = expandedWeeks.has(weekKey);
          const maxLane = spans.reduce((m, s) => Math.max(m, s.lane), -1);
          const visibleLaneLimit = expanded
            ? maxLane
            : Math.min(maxLane, MAX_VISIBLE_LANES - 1);
          const visibleSpans = spans.filter((s) => s.lane <= visibleLaneLimit);
          const hiddenCount = spans.filter(
            (s) => s.lane > visibleLaneLimit,
          ).length;
          const laneCount = Math.max(visibleLaneLimit + 1, 0);
          const overflowExtra =
            hiddenCount > 0 || (expanded && spans.length > MAX_VISIBLE_LANES)
              ? BAR_H + LANE_GAP
              : 0;
          const bodyH = Math.max(
            laneCount * (BAR_H + LANE_GAP) + LANE_GAP + overflowExtra,
            40,
          );

          return (
            <div
              key={weekKey}
              className="relative"
              style={{ minHeight: DAY_HEADER_H + bodyH + 8 }}
            >
              <div
                className="grid grid-cols-5 gap-1"
                style={{ minHeight: DAY_HEADER_H + bodyH + 8 }}
              >
                {days.map((day) => {
                  const key = toDateKey(day);
                  const inMonth = isSameMonth(day, month);
                  const isToday = key === todayKey;
                  return (
                    <div
                      key={key}
                      className={cn(
                        "min-w-0 rounded-md border border-transparent p-1",
                        !inMonth && "opacity-40",
                        isToday &&
                          "border-[var(--accent)]/30 bg-[var(--today-col)]",
                      )}
                    >
                      <div
                        className={cn(
                          "text-right text-[11px] tabular-nums",
                          isToday
                            ? "font-semibold text-[var(--accent)]"
                            : "text-[var(--text-muted)]",
                        )}
                        style={{ height: DAY_HEADER_H }}
                      >
                        {format(day, "d")}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Same 5-col + gap grid overlays day cells so multi-day bars align. */}
              <div
                className="pointer-events-none absolute inset-x-0 top-0 z-10 grid grid-cols-5 gap-1"
                style={{
                  paddingTop: DAY_HEADER_H + 4,
                  height: DAY_HEADER_H + bodyH + 8,
                }}
              >
                {visibleSpans.map((span) => (
                  <div
                    key={`${weekKey}-${span.task.id}`}
                    className="pointer-events-auto flex min-w-0 items-center gap-0.5 self-start truncate rounded px-1 text-[10px] font-medium leading-tight text-white"
                    style={{
                      gridColumn: `${span.startCol + 1} / ${span.endCol + 2}`,
                      gridRow: 1,
                      height: BAR_H,
                      marginTop: span.lane * (BAR_H + LANE_GAP),
                      backgroundColor: span.task.tone,
                      width: "100%",
                    }}
                    title={
                      span.task.spanStart === span.task.spanEnd
                        ? span.task.title
                        : `${span.task.title} (${span.task.spanStart} → ${span.task.spanEnd})`
                    }
                  >
                    {span.task.showCrStar ? (
                      <Star
                        size={8}
                        className={cn(
                          "shrink-0",
                          isClientReviewApproved(span.task)
                            ? "fill-white/90 text-white/90"
                            : "fill-white text-white",
                        )}
                        aria-hidden
                      />
                    ) : null}
                    <span className="min-w-0 truncate">{span.task.title}</span>
                  </div>
                ))}
                {hiddenCount > 0 ? (
                  <button
                    type="button"
                    className="pointer-events-auto h-fit w-fit cursor-pointer justify-self-start rounded-full bg-[var(--status-attention)] px-2 py-0.5 text-[11px] font-medium text-white hover:opacity-90"
                    style={{
                      gridColumn: "1 / 2",
                      gridRow: 1,
                      marginTop: MAX_VISIBLE_LANES * (BAR_H + LANE_GAP),
                    }}
                    onClick={() => toggleWeekExpanded(weekKey)}
                    aria-expanded={false}
                    aria-label={`Show ${hiddenCount} more tasks week of ${format(parseISO(weekKey), "MMM d")}`}
                  >
                    +{hiddenCount}
                  </button>
                ) : expanded && spans.length > MAX_VISIBLE_LANES ? (
                  <button
                    type="button"
                    className="pointer-events-auto h-fit w-fit cursor-pointer justify-self-start text-[10px] text-[var(--accent)] hover:underline"
                    style={{
                      gridColumn: "1 / 2",
                      gridRow: 1,
                      marginTop: laneCount * (BAR_H + LANE_GAP),
                    }}
                    onClick={() => toggleWeekExpanded(weekKey)}
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
