"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { addWeeks, format } from "date-fns";
import { SchedulePie, type SchedulePieSlice } from "@/components/charts/schedule-pie";
import { UtilizationHeatmap } from "@/components/heatmap/utilization-heatmap";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { ReportBreadcrumb } from "@/components/nav/breadcrumbs";
import { panelClass } from "@/components/ui/panel";
import { ProjectColorBar } from "@/components/ui/project-color-bar";
import { useData } from "@/lib/data/store";
import { formatHours } from "@/lib/domain/budget";
import {
  availableHoursInRange,
  projectBookedHoursByProjectInRange,
} from "@/lib/domain/capacity";
import { toDateKey, weekEnd, weekStart } from "@/lib/domain/dates";
import { projectDisplayColor } from "@/lib/domain/sorting";
import { useAppHref, useProjectHref } from "@/lib/hooks/use-app-href";

const WEEK_TITLES = ["This week", "Next week", "In 2 weeks"] as const;

export default function UtilizationReportPage() {
  const { state, mode, ensureScheduleRange } = useData();
  const appHref = useAppHref();
  const projectHref = useProjectHref();
  const now = useMemo(() => new Date(), []);

  const weekAnchors = useMemo(
    () => Array.from({ length: 3 }, (_, i) => weekStart(addWeeks(now, i))),
    [now],
  );

  const rangeStart = toDateKey(weekAnchors[0]!);
  const rangeEnd = toDateKey(weekEnd(weekAnchors[2]!));

  useEffect(() => {
    if (mode === "supabase") {
      void ensureScheduleRange(rangeStart, rangeEnd);
    }
  }, [mode, ensureScheduleRange, rangeStart, rangeEnd]);

  const weekBreakdowns = useMemo(() => {
    return weekAnchors.map((anchor, index) => {
      const start = toDateKey(anchor);
      const end = toDateKey(weekEnd(anchor));
      const byProject = projectBookedHoursByProjectInRange(
        start,
        end,
        state.assignments,
        state.leave_days,
      );

      const slices: SchedulePieSlice[] = [...byProject.entries()]
        .map(([projectId, hours]) => {
          const project = state.projects.find((p) => p.id === projectId);
          const client = project?.client_id
            ? state.clients.find((c) => c.id === project.client_id)
            : undefined;
          return {
            projectId,
            hours,
            color: project
              ? projectDisplayColor(project, state.clients)
              : "#64748B",
            label: client?.name
              ? `${client.name} · ${project?.name ?? "Project"}`
              : (project?.name ?? "Project"),
          };
        })
        .sort((a, b) => b.hours - a.hours);

      const booked = slices.reduce((sum, s) => sum + s.hours, 0);
      let available = 0;
      for (const person of state.people) {
        available += availableHoursInRange(
          person,
          start,
          end,
          state.leave_days,
        );
      }
      const free = Math.max(0, available - booked);
      if (free > 0.01) {
        slices.push({
          projectId: "__free__",
          hours: free,
          color: "#94a3b8",
          label: "Available",
        });
      }

      return {
        key: start,
        title: WEEK_TITLES[index]!,
        rangeLabel: `${format(anchor, "MMM d")} – ${format(weekEnd(anchor), "MMM d")}`,
        slices,
        booked,
      };
    });
  }, [
    weekAnchors,
    state.assignments,
    state.leave_days,
    state.projects,
    state.clients,
    state.people,
  ]);

  return (
    <PageContainer className="overflow-y-auto">
      <PageHeader title={<ReportBreadcrumb current="Utilization" />} />
      <div className="space-y-3 py-3 sm:py-5">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">
            Team Utilization - Next 8 Weeks
          </h2>
          <UtilizationHeatmap weeks={8} showTeamAverage />
        </section>

        <section className="space-y-3 pt-2">
          <h2 className="text-sm font-semibold">
            Total Hours By Projects - Next 3 Weeks
          </h2>
          <div className="grid gap-3 lg:grid-cols-3">
          {weekBreakdowns.map((week) => {
            const pieTotal = week.slices.reduce((s, x) => s + x.hours, 0);
            return (
              <section key={week.key} className={panelClass()}>
                <div className="mb-3 min-w-0">
                  <h3 className="text-sm font-semibold">{week.title}</h3>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    {week.rangeLabel} · hours by project
                  </p>
                </div>

                {pieTotal <= 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">
                    Nothing scheduled this week.
                  </p>
                ) : (
                  <div className="flex flex-col items-center gap-4 pt-2 sm:flex-row sm:items-start lg:flex-col xl:flex-row">
                    <SchedulePie
                      slices={week.slices}
                      totalHours={week.booked}
                      className="size-[10rem] sm:size-[11rem] xl:size-[12rem]"
                    />
                    <ul className="min-w-0 flex-1 space-y-1.5 self-stretch">
                      {week.slices.map((slice) => {
                        const pct =
                          pieTotal > 0
                            ? Math.round((slice.hours / pieTotal) * 100)
                            : 0;
                        const isFree = slice.projectId === "__free__";
                        const project = state.projects.find(
                          (p) => p.id === slice.projectId,
                        );
                        const row = (
                          <span className="flex items-center gap-2 text-sm">
                            <ProjectColorBar color={slice.color} />
                            <span className="min-w-0 flex-1 truncate">
                              {slice.label}
                            </span>
                            <span className="shrink-0 tabular-nums text-xs text-[var(--text-muted)]">
                              {formatHours(slice.hours)}
                              <span className="ml-1 opacity-70">· {pct}%</span>
                            </span>
                          </span>
                        );
                        return (
                          <li key={slice.projectId}>
                            {isFree ? (
                              <div className="rounded-md px-2 py-1.5">
                                {row}
                              </div>
                            ) : (
                              <Link
                                href={
                                  project
                                    ? projectHref(project)
                                    : appHref("/projects")
                                }
                                className="block rounded-md px-2 py-1.5 hover:bg-[var(--row-hover)]"
                              >
                                {row}
                              </Link>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </section>
            );
          })}
          </div>
        </section>
      </div>
    </PageContainer>
  );
}
