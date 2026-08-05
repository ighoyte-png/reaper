"use client";

import { SchedulePie, type SchedulePieSlice } from "@/components/charts/schedule-pie";
import { ProjectColorBar } from "@/components/ui/project-color-bar";
import type { Task } from "@/lib/types";
import { toDateKey } from "@/lib/domain/dates";

export type ProjectTasksPieStats = {
  overdue: number;
  noDue: number;
  upcoming: number;
  inProgress: number;
  complete: number;
  open: number;
};

/** Aggregate open-task buckets matching Reports TasksOverview. */
export function projectTasksPieStats(
  tasks: Pick<Task, "status" | "due_date" | "is_divider">[],
  todayKey: string = toDateKey(new Date()),
): ProjectTasksPieStats {
  const real = tasks.filter((t) => !t.is_divider);
  const openTasks = real.filter((t) => t.status !== "complete");
  const overdue = openTasks.filter((t) => t.due_date && t.due_date < todayKey);
  const inProgress = openTasks.filter(
    (t) => t.status === "active" && (!t.due_date || t.due_date >= todayKey),
  );
  const noDue = openTasks.filter(
    (t) => t.status !== "active" && !t.due_date,
  );
  const upcoming = openTasks.filter(
    (t) => t.status !== "active" && t.due_date && t.due_date >= todayKey,
  );
  return {
    overdue: overdue.length,
    noDue: noDue.length,
    upcoming: upcoming.length,
    inProgress: inProgress.length,
    complete: real.filter((t) => t.status === "complete").length,
    open: openTasks.length,
  };
}

/** Portal pie: Active / In Review / Completed only. */
export function projectPortalTasksPieStats(
  tasks: Pick<Task, "status" | "is_divider">[],
): { active: number; inReview: number; complete: number; total: number } {
  const real = tasks.filter((t) => !t.is_divider);
  const active = real.filter((t) => t.status === "upcoming").length;
  const inReview = real.filter((t) => t.status === "active").length;
  const complete = real.filter((t) => t.status === "complete").length;
  return { active, inReview, complete, total: active + inReview + complete };
}

/** Reports-style Project Tasks pie for a single project. */
export function ProjectTasksPie({
  stats,
  className,
  showCompletedLine = true,
}: {
  stats: ProjectTasksPieStats;
  className?: string;
  showCompletedLine?: boolean;
}) {
  const slices: SchedulePieSlice[] = (
    [
      {
        projectId: "overdue",
        hours: stats.overdue,
        color: "var(--status-over)",
        label: "Overdue",
      },
      {
        projectId: "in-progress",
        hours: stats.inProgress,
        color: "var(--task-active-fg)",
        label: "In Review",
      },
      {
        projectId: "no-due",
        hours: stats.noDue,
        color: "#94a3b8",
        label: "No due date",
      },
      {
        projectId: "upcoming",
        hours: stats.upcoming,
        color: "var(--accent)",
        label: "Active",
      },
    ] as const
  ).filter((s) => s.hours > 0);

  const openMix =
    stats.overdue + stats.inProgress + stats.noDue + stats.upcoming;

  return (
    <div className={className ?? "space-y-3"}>
      {openMix <= 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No open tasks.</p>
      ) : (
        <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="mx-auto aspect-square w-full max-w-[10rem] sm:max-w-none">
            <SchedulePie
              slices={slices}
              totalHours={openMix}
              centerValue={String(openMix)}
              centerLabel="open"
              centerScale={2}
              className="!size-full max-w-none"
            />
          </div>
          <ul className="min-w-0 space-y-1.5">
            {slices.map((slice) => {
              const pct =
                openMix > 0 ? Math.round((slice.hours / openMix) * 100) : 0;
              return (
                <li key={slice.projectId}>
                  <span className="flex items-center gap-2 text-sm">
                    <ProjectColorBar color={slice.color} />
                    <span className="min-w-0 flex-1 truncate">{slice.label}</span>
                    <span className="shrink-0 tabular-nums text-xs text-[var(--text-muted)]">
                      {slice.hours}
                      <span className="ml-1 opacity-70">· {pct}%</span>
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {showCompletedLine ? (
        <p className="text-[11px] text-[var(--text-muted)]">
          {stats.complete} completed
        </p>
      ) : null}
    </div>
  );
}

/** Portal pie: Active / In Review / Completed. */
export function PortalProjectTasksPie({
  active,
  inReview,
  complete,
}: {
  active: number;
  inReview: number;
  complete: number;
}) {
  const total = active + inReview + complete;
  const slices: SchedulePieSlice[] = (
    [
      {
        projectId: "active",
        hours: active,
        color: "var(--accent)",
        label: "Tasks Active",
      },
      {
        projectId: "in-review",
        hours: inReview,
        color: "var(--task-active-fg)",
        label: "Tasks In Review",
      },
      {
        projectId: "complete",
        hours: complete,
        color: "var(--status-healthy)",
        label: "Tasks Completed",
      },
    ] as const
  ).filter((s) => s.hours > 0);

  return (
    <div className="space-y-3">
      {total <= 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No tasks.</p>
      ) : (
        <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="mx-auto aspect-square w-full max-w-[10rem] sm:max-w-none">
            <SchedulePie
              slices={slices}
              totalHours={total}
              centerValue={String(total)}
              centerLabel="tasks"
              centerScale={2}
              className="!size-full max-w-none"
            />
          </div>
          <ul className="min-w-0 space-y-1.5">
            {slices.map((slice) => {
              const pct = total > 0 ? Math.round((slice.hours / total) * 100) : 0;
              return (
                <li key={slice.projectId}>
                  <span className="flex items-center gap-2 text-sm">
                    <ProjectColorBar color={slice.color} />
                    <span className="min-w-0 flex-1 truncate">{slice.label}</span>
                    <span className="shrink-0 tabular-nums text-xs text-[var(--text-muted)]">
                      {slice.hours}
                      <span className="ml-1 opacity-70">· {pct}%</span>
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
