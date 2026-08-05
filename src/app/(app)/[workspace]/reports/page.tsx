"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { addWeeks, format } from "date-fns";
import {
  ClipboardList,
  Gauge,
  LineChart,
  type LucideIcon,
} from "lucide-react";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { SchedulePie, type SchedulePieSlice } from "@/components/charts/schedule-pie";
import { BudgetStatusLine } from "@/components/reports/budget-status-line";
import { BurnBar } from "@/components/ui/burn-bar";
import { buttonClass } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { ProjectColorBar } from "@/components/ui/project-color-bar";
import { StatCountBadge } from "@/components/ui/stat-count-badge";
import { useData } from "@/lib/data/store";
import { useAppHref, useBudgetHref } from "@/lib/hooks/use-app-href";
import { useUrlFilters } from "@/lib/hooks/use-url-filters";
import { useProjectBurnsMap } from "@/lib/hooks/use-aggregates";
import { useViewAs } from "@/lib/view-as";
import {
  assignmentHours,
  budgetBurn,
  budgetHealth,
  formatHours,
} from "@/lib/domain/budget";
import { scheduleVisiblePeople } from "@/lib/domain/people";
import {
  personIdsInPod,
  podsForPerson,
  podsManagedBy,
} from "@/lib/domain/pods";
import type { BudgetBurn, Project } from "@/lib/types";
import {
  availableHoursInRange,
  capacityLevel,
  personBookedHoursInRange,
  utilizationPct,
} from "@/lib/domain/capacity";
import { toDateKey, weekEnd, weekStart } from "@/lib/domain/dates";
import { cn } from "@/lib/cn";

const reports: {
  path: string;
  title: string;
  description: string;
  cta: string;
  icon: LucideIcon;
  column: "left" | "right";
}[] = [
  {
    path: "/reports/budgets",
    title: "All Active Project Budgets",
    description:
      "Scheduled Hours and Contractor Expenses Tracked Against Project Budgets",
    cta: "Scheduled Hours and Contractor Expenses Tracked Against Project Budgets",
    icon: LineChart,
    column: "right",
  },
  {
    path: "/reports/utilization",
    title: "All People Utilization",
    description:
      "Utilization Percentage for All People Combined (Unless Disabled from Utilization Reporting)",
    cta: "Team Utilization vs Capacity by Week",
    icon: Gauge,
    column: "left",
  },
  {
    path: "/reports/tasks",
    title: "All Project Tasks",
    description:
      "Overdue Tasks, Tasks Missing a Due Date, and Recently Completed Tasks.",
    cta: "Overdue, No Due Date, and Recently Completed Work",
    icon: ClipboardList,
    column: "left",
  },
];

function utilBarTone(pct: number): "over" | "near" | "healthy" | "low" {
  if (pct >= 100) return "over";
  if (pct >= 85) return "near";
  if (pct >= 60) return "healthy";
  return "low";
}

type WeekUtilPoint = {
  key: string;
  label: string;
  pct: number;
  booked: number;
  available: number;
};

export default function ReportsPage() {
  return (
    <Suspense fallback={null}>
      <ReportsPageContent />
    </Suspense>
  );
}

function ReportsPageContent() {
  const {
    state,
    isPublicShare,
    ensureScheduleRange,
    fetchOrgTaskStatsRpc,
    mode,
    myPerson,
  } = useData();
  const { burns } = useProjectBurnsMap();
  const { effectiveCanManage, effectivePersonId } = useViewAs();
  const canManage = effectiveCanManage;
  const appHref = useAppHref();
  const budgetHref = useBudgetHref();
  const router = useRouter();
  const now = useMemo(() => new Date(), []);
  const todayKey = toDateKey(now);
  const utilStart = toDateKey(weekStart(now));
  const utilEnd = toDateKey(weekEnd(addWeeks(now, 7)));
  const { filters, setFilter } = useUrlFilters({ scope: "all" });
  const scopeMine = filters.scope === "mine";

  const viewerPersonId = effectivePersonId ?? myPerson?.id ?? null;

  const managedPodIds = useMemo(() => {
    if (!viewerPersonId) return [] as string[];
    return podsManagedBy(viewerPersonId, state.pods).map((p) => p.id);
  }, [viewerPersonId, state.pods]);

  const memberPodIds = useMemo(() => {
    if (!viewerPersonId) return [] as string[];
    return podsForPerson(viewerPersonId, state.pods, state.pod_members).map(
      (p) => p.id,
    );
  }, [viewerPersonId, state.pods, state.pod_members]);

  const utilPodIds =
    managedPodIds.length > 0 ? managedPodIds : memberPodIds;

  const managedProjectIds = useMemo(() => {
    if (!viewerPersonId) return [] as string[];
    return state.projects
      .filter(
        (p) => !p.sandbox_mode && p.manager_person_id === viewerPersonId,
      )
      .map((p) => p.id);
  }, [viewerPersonId, state.projects]);

  const showScopeFilter =
    canManage &&
    (managedPodIds.length > 0 || managedProjectIds.length > 0);

  useEffect(() => {
    if (!canManage && !isPublicShare) router.replace(appHref("/dashboard"));
  }, [canManage, isPublicShare, router, appHref]);

  useEffect(() => {
    if (mode === "supabase") void ensureScheduleRange(utilStart, utilEnd);
  }, [mode, ensureScheduleRange, utilStart, utilEnd]);

  const [taskStats, setTaskStats] = useState<{
    overdue: number;
    noDue: number;
    upcoming: number;
    inProgress: number;
    complete: number;
    open: number;
  } | null>(null);

  const useScopedTaskStats =
    scopeMine && managedProjectIds.length > 0;

  useEffect(() => {
    if (useScopedTaskStats) {
      setTaskStats(null);
      return;
    }
    let cancelled = false;
    async function load() {
      if (mode !== "supabase") {
        setTaskStats(null);
        return;
      }
      const stats = await fetchOrgTaskStatsRpc(todayKey);
      if (cancelled || !stats) {
        if (!cancelled) setTaskStats(null);
        return;
      }
      setTaskStats({
        overdue: stats.overdue_count,
        noDue: stats.no_due_count,
        upcoming: stats.upcoming_count,
        inProgress: stats.in_progress_count,
        complete: stats.complete_count,
        open: stats.open_count,
      });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [mode, fetchOrgTaskStatsRpc, todayKey, useScopedTaskStats]);

  const scopedProjects = useMemo(() => {
    const base = state.projects.filter((p) => !p.sandbox_mode);
    if (!scopeMine || managedProjectIds.length === 0) return base;
    const ids = new Set(managedProjectIds);
    return base.filter((p) => ids.has(p.id));
  }, [state.projects, scopeMine, managedProjectIds]);

  /**
   * Utilization overview: all schedule-visible people, optionally scoped
   * to managed/member pods when “Projects and Pods I Manage” is on.
   */
  const orgScopedPeople = useMemo(() => {
    const visible = scheduleVisiblePeople(state.people);
    if (!scopeMine || utilPodIds.length === 0) return visible;
    const ids = new Set<string>();
    for (const podId of utilPodIds) {
      const pod = state.pods.find((p) => p.id === podId);
      if (!pod) continue;
      for (const id of personIdsInPod(pod, state.pod_members)) ids.add(id);
    }
    return visible.filter((p) => ids.has(p.id));
  }, [
    state.people,
    state.pods,
    state.pod_members,
    scopeMine,
    utilPodIds,
  ]);

  const plannedHoursAcrossSchedule = useMemo(() => {
    let sum = 0;
    for (const p of scopedProjects) {
      const burn = burns.get(p.id);
      if (burn) sum += burn.plannedHours;
      else {
        sum += state.assignments
          .filter((a) => a.project_id === p.id && a.status === "confirmed")
          .reduce((s, a) => s + assignmentHours(a), 0);
      }
    }
    return sum;
  }, [scopedProjects, state.assignments, burns]);

  const utilization = useMemo(() => {
    const weekAnchors = Array.from({ length: 8 }, (_, i) =>
      weekStart(addWeeks(now, i)),
    );
    const weeks: WeekUtilPoint[] = weekAnchors.map((anchor) => {
      const start = toDateKey(anchor);
      const end = toDateKey(weekEnd(anchor));
      let booked = 0;
      let available = 0;
      for (const person of orgScopedPeople) {
        booked += personBookedHoursInRange(
          person.id,
          start,
          end,
          state.assignments,
          state.leave_days,
        );
        available += availableHoursInRange(
          person,
          start,
          end,
          state.leave_days,
        );
      }
      return {
        key: start,
        label: format(anchor, "MMM d"),
        pct:
          available <= 0
            ? 0
            : Math.min(200, utilizationPct(booked, available)),
        booked,
        available,
      };
    });

    const thisStart = toDateKey(weekStart(now));
    const thisEnd = toDateKey(weekEnd(now));
    let healthy = 0;
    let near = 0;
    let over = 0;
    let unavailable = 0;
    for (const person of orgScopedPeople) {
      const booked = personBookedHoursInRange(
        person.id,
        thisStart,
        thisEnd,
        state.assignments,
        state.leave_days,
      );
      const available = availableHoursInRange(
        person,
        thisStart,
        thisEnd,
        state.leave_days,
      );
      const level = capacityLevel(booked, available, available <= 0);
      if (level === "healthy") healthy += 1;
      else if (level === "near") near += 1;
      else if (level === "over") over += 1;
      else unavailable += 1; // low + unavailable → Underutilized
    }

    return {
      thisWeek: weeks[0]!,
      weeks,
      healthy,
      near,
      over,
      unavailable,
      peopleCount: orgScopedPeople.length,
    };
  }, [orgScopedPeople, state.assignments, state.leave_days, now]);

  const budgets = useMemo(() => {
    let healthy = 0;
    let near = 0;
    let over = 0;
    const rows = scopedProjects
      .map((p) => {
        const burn =
          burns.get(p.id) ?? budgetBurn(p, state.assignments, state.people);
        if (burn.mode === "none") return null;
        const health = budgetHealth(burn);
        if (health === "healthy") healthy += 1;
        else if (health === "near") near += 1;
        else if (health === "over") over += 1;
        const client = state.clients.find((c) => c.id === p.client_id);
        return {
          id: p.id,
          project: p,
          name: client?.name ? `${client.name} · ${p.name}` : p.name,
          pct: burn.pct,
          health,
          burn,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null)
      .sort((a, b) => b.pct - a.pct);
    return {
      tracked: rows.length,
      healthy,
      near,
      over,
      rows,
    };
  }, [scopedProjects, state.assignments, state.people, state.clients, burns]);

  const tasks = useMemo(() => {
    if (taskStats && !useScopedTaskStats) return taskStats;
    const scopedIds = new Set(scopedProjects.map((p) => p.id));
    const tasksScoped = state.tasks.filter((t) => scopedIds.has(t.project_id));
    const openTasks = tasksScoped.filter((t) => t.status !== "complete");
    const overdue = openTasks.filter((t) => t.due_date && t.due_date < todayKey);
    const inProgress = openTasks.filter(
      (t) =>
        t.status === "active" &&
        (!t.due_date || t.due_date >= todayKey),
    );
    const noDue = openTasks.filter(
      (t) => t.status !== "active" && !t.due_date,
    );
    const upcoming = openTasks.filter(
      (t) =>
        t.status !== "active" &&
        t.due_date &&
        t.due_date >= todayKey,
    );
    const complete = tasksScoped.filter((t) => t.status === "complete");
    return {
      overdue: overdue.length,
      noDue: noDue.length,
      upcoming: upcoming.length,
      inProgress: inProgress.length,
      complete: complete.length,
      open: openTasks.length,
    };
  }, [
    taskStats,
    useScopedTaskStats,
    scopedProjects,
    state.tasks,
    todayKey,
  ]);

  if (!canManage && !isPublicShare) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--text-muted)]">
        Redirecting…
      </div>
    );
  }

  return (
    <PageContainer className="overflow-y-auto">
      <PageHeader title="Reports" />
      {showScopeFilter ? (
        <section
          className="mt-3 rounded-md border border-[var(--border)] bg-[var(--bg)] p-4 sm:mt-5"
          aria-label="Report Scope"
        >
          <h2 className="mb-3 text-sm font-semibold">Scope</h2>
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            <li>
              <ScopeChip
                label="All Data"
                selected={!scopeMine}
                onSelect={() => setFilter("scope", "all")}
              />
            </li>
            <li>
              <ScopeChip
                label="Projects and Pods I Manage"
                selected={scopeMine}
                onSelect={() => setFilter("scope", "mine")}
              />
            </li>
          </ul>
        </section>
      ) : null}
      <div className="grid gap-3 py-3 sm:py-5 md:grid-cols-2 md:items-stretch">
        <div className="flex h-full min-h-0 flex-col gap-3">
          {reports
            .filter((r) => r.column === "left")
            .map((report) => (
              <ReportCard
                key={report.path}
                report={report}
                appHref={appHref}
                overview={
                  report.path === "/reports/utilization" ? (
                    <UtilizationOverview data={utilization} />
                  ) : (
                    <TasksOverview data={tasks} />
                  )
                }
              />
            ))}
        </div>
        <div className="flex h-full min-h-0 flex-col">
          {reports
            .filter((r) => r.column === "right")
            .map((report) => (
              <ReportCard
                key={report.path}
                report={report}
                appHref={appHref}
                className="h-full flex-1"
                overview={
                  <BudgetsOverview
                    data={budgets}
                    plannedHours={plannedHoursAcrossSchedule}
                    budgetHref={budgetHref}
                  />
                }
              />
            ))}
        </div>
      </div>
    </PageContainer>
  );
}

function ScopeChip({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-md border px-1.5 py-1 transition-colors",
        selected
          ? "border-[var(--text)] bg-[var(--bg-elevated)]"
          : "border-transparent hover:bg-[var(--row-hover)]",
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={selected}
        onClick={onSelect}
        className="min-w-0 cursor-pointer px-1 text-left text-sm font-medium"
      >
        {label}
      </button>
    </div>
  );
}

function ReportCard({
  report,
  appHref,
  overview,
  className,
}: {
  report: (typeof reports)[number];
  appHref: (path: string) => string;
  overview: ReactNode;
  className?: string;
}) {
  const Icon = report.icon;
  return (
    <Panel padded={false} className={cn("flex flex-col", className)}>
      <div className="flex min-h-0 flex-1 flex-col p-4 pb-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--bg-elevated)] text-[var(--text-muted)]">
            <Icon size={16} strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-[var(--text)]">
              {report.title}
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {report.description}
            </p>
          </div>
        </div>

        <div className="mt-4 flex min-h-0 flex-1 flex-col border-t border-[var(--border)] pt-3">
          {overview}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-2.5">
        <p className="min-w-0 truncate text-xs text-[var(--text-muted)]">
          {report.cta}
        </p>
        <Link
          href={appHref(report.path)}
          className={buttonClass({
            variant: "secondary",
            size: "sm",
            className: "h-8 shrink-0 px-3 text-xs",
          })}
        >
          View Details
        </Link>
      </div>
    </Panel>
  );
}

function UtilizationOverview({
  data,
}: {
  data: {
    thisWeek: WeekUtilPoint;
    weeks: WeekUtilPoint[];
    healthy: number;
    near: number;
    over: number;
    unavailable: number;
    peopleCount: number;
  };
}) {
  const chartMax = Math.max(120, ...data.weeks.map((w) => w.pct), 1);
  const yTicks = [0, 50].filter((t) => t <= chartMax);
  if (chartMax > 100) yTicks.push(Math.round(chartMax / 50) * 50);
  const capacityLine = Math.min(100, chartMax);

  const thisTone = utilBarTone(data.thisWeek.pct);

  const headcount = Math.max(
    1,
    data.healthy + data.near + data.over + data.unavailable,
  );

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] text-[var(--text-muted)]">This Week</p>
          <p
            className={cn(
              "text-2xl font-semibold tabular-nums tracking-tight",
              thisTone === "over" && "text-[var(--status-over)]",
              thisTone === "near" && "text-[var(--status-near)]",
              thisTone === "healthy" && "text-[var(--status-healthy)]",
              thisTone === "low" && "text-[var(--text-muted)]",
            )}
          >
            {data.peopleCount === 0
              ? "—"
              : `${Math.round(data.thisWeek.pct)}%`}
          </p>
        </div>
        <p className="pb-1 text-right text-[11px] text-[var(--text-muted)]">
          {formatHours(data.thisWeek.booked)} Booked
          <br />
          {formatHours(data.thisWeek.available)} Available
        </p>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-medium text-[var(--text-muted)]">
          Team Utilization · Next 8 Weeks
        </p>
        <div className="relative h-28">
          {yTicks.map((tick) => {
            const bottom = (tick / chartMax) * 100;
            return (
              <div
                key={tick}
                className="pointer-events-none absolute inset-x-0"
                style={{ bottom: `${bottom}%` }}
              >
                <div className="border-t border-[var(--border)]" />
                <span className="absolute -top-2 left-0 text-[8px] tabular-nums text-[var(--text-muted)]">
                  {tick}%
                </span>
              </div>
            );
          })}

          <div className="absolute inset-y-0 left-7 right-0 flex items-end gap-1">
            {data.weeks.map((week, i) => {
              const tone = utilBarTone(week.pct);
              const fillPct = Math.min(week.pct, chartMax);
              const trackPct = Math.min(Math.max(capacityLine, fillPct), chartMax);
              const fillHeight = (fillPct / chartMax) * 100;
              const trackHeight = (trackPct / chartMax) * 100;
              return (
                <div
                  key={week.key}
                  className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
                  title={`${week.label}: ${Math.round(week.pct)}% · ${formatHours(week.booked)} / ${formatHours(week.available)}`}
                >
                  <div
                    className={cn(
                      "relative w-full max-w-[22px] overflow-hidden rounded-t bg-[var(--border)]",
                      i === 0 &&
                        "ring-1 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--bg)]",
                    )}
                    style={{ height: `${Math.max(trackHeight, fillHeight, week.pct > 0 ? 4 : 0)}%` }}
                  >
                    <div
                      className={cn(
                        "absolute inset-x-0 bottom-0 rounded-t",
                        tone === "over" && "bg-[var(--status-over)]",
                        tone === "near" && "bg-[var(--status-near)]",
                        tone === "healthy" && "bg-[var(--status-healthy)]",
                        tone === "low" && "bg-[var(--status-healthy)]",
                      )}
                      style={{
                        height:
                          trackHeight > 0
                            ? `${(fillHeight / Math.max(trackHeight, 0.001)) * 100}%`
                            : "0%",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="ml-7 mt-1 flex gap-1">
          {data.weeks.map((week) => (
            <div
              key={`l-${week.key}`}
              className="min-w-0 flex-1 text-center text-[8px] text-[var(--text-muted)]"
            >
              <span className="block truncate">{week.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-[11px] text-[var(--text-muted)]">
          This Week · All Peoples Utilization
        </p>
        <div className="flex h-3.5 overflow-hidden rounded-full bg-[var(--border)]">
          {(
            [
              {
                value: data.healthy,
                className: "bg-[var(--status-healthy)]",
                title: `Optimal: ${data.healthy}`,
              },
              {
                value: data.near,
                className: "bg-[var(--status-near)]",
                title: `Near Capacity: ${data.near}`,
              },
              {
                value: data.over,
                className: "bg-[var(--status-over)]",
                title: `Overbooked: ${data.over}`,
              },
              {
                value: data.unavailable,
                className: "bg-[var(--status-unavailable)]",
                title: `Underutilized: ${data.unavailable}`,
              },
            ] as const
          )
            .map((s, i) => ({ ...s, i }))
            .filter((s) => s.value > 0)
            .map((s, idx, visible) => (
              <div
                key={s.i}
                className={cn(
                  s.className,
                  visible.length === 1 && "rounded-full",
                  visible.length > 1 && idx === 0 && "rounded-l-full",
                  visible.length > 1 &&
                    idx === visible.length - 1 &&
                    "rounded-r-full",
                )}
                style={{ width: `${(s.value / headcount) * 100}%` }}
                title={s.title}
              />
            ))}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <StatCountBadge
              count={data.healthy}
              className="bg-[var(--status-healthy)]"
            />
            Optimal
          </span>
          <span className="inline-flex items-center gap-1.5">
            <StatCountBadge
              count={data.near}
              className="bg-[var(--status-near)]"
            />
            Near Capacity
          </span>
          <span className="inline-flex items-center gap-1.5">
            <StatCountBadge
              count={data.over}
              className="bg-[var(--status-over)]"
            />
            Overbooked
          </span>
          <span className="inline-flex items-center gap-1.5">
            <StatCountBadge
              count={data.unavailable}
              className="bg-[var(--status-unavailable)]"
            />
            Underutilized
          </span>
        </div>
      </div>
    </div>
  );
}

function BudgetsOverview({
  data,
  plannedHours,
  budgetHref,
}: {
  data: {
    tracked: number;
    healthy: number;
    near: number;
    over: number;
    rows: {
      id: string;
      project: Project;
      name: string;
      pct: number;
      health: string;
      burn: BudgetBurn;
    }[];
  };
  plannedHours: number;
  budgetHref: (project: Pick<Project, "client_id" | "slug">) => string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="shrink-0">
        <BudgetStatusLine
          tracked={data.tracked}
          healthy={data.healthy}
          near={data.near}
          over={data.over}
        />
      </div>
      {data.rows.length > 0 ? (
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
          {data.rows.map((row) => (
            <Link
              key={row.id}
              href={budgetHref(row.project)}
              className="-mx-1 block space-y-1 rounded-md px-1 py-0.5 hover:bg-[var(--row-hover)]"
            >
              <div className="flex justify-between gap-2 text-[11px]">
                <span className="truncate text-[var(--text-muted)]">
                  {row.name}
                </span>
                <span className="shrink-0 tabular-nums">
                  {Math.round(row.pct)}%
                </span>
              </div>
              <BurnBar burn={row.burn} compact />
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-xs text-[var(--text-muted)]">No Budgeted Projects.</p>
      )}
      <div className="shrink-0 border-t border-[var(--border)] pt-2">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="text-[var(--text-muted)]">
            Hours Planned Across the Schedule
          </span>
          <span className="tabular-nums font-medium text-[var(--text)]">
            {formatHours(plannedHours)}
          </span>
        </div>
      </div>
    </div>
  );
}

function TasksOverview({
  data,
}: {
  data: {
    overdue: number;
    noDue: number;
    upcoming: number;
    inProgress: number;
    complete: number;
    open: number;
  };
}) {
  const slices: SchedulePieSlice[] = (
    [
      {
        projectId: "overdue",
        hours: data.overdue,
        color: "var(--status-over)",
        label: "Overdue",
      },
      {
        projectId: "in-progress",
        hours: data.inProgress,
        color: "var(--task-active-fg)",
        label: "In Review",
      },
      {
        projectId: "no-due",
        hours: data.noDue,
        color: "#94a3b8",
        label: "No due date",
      },
      {
        projectId: "upcoming",
        hours: data.upcoming,
        color: "var(--accent)",
        label: "Active",
      },
    ] as const
  ).filter((s) => s.hours > 0);

  const openMix =
    data.overdue + data.inProgress + data.noDue + data.upcoming;

  return (
    <div className="space-y-3">
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
      <p className="text-[11px] text-[var(--text-muted)]">
        {data.complete} completed
      </p>
    </div>
  );
}
