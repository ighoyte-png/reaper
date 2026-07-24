"use client";

import Link from "next/link";
import { useEffect, useMemo, type ReactNode } from "react";
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
import { BurnBar } from "@/components/ui/burn-bar";
import { buttonClass } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { useData } from "@/lib/data/store";
import { useAppHref, useBudgetHref } from "@/lib/hooks/use-app-href";
import { useProjectBurnsMap } from "@/lib/hooks/use-aggregates";
import { useViewAs } from "@/lib/view-as";
import {
  assignmentHours,
  budgetBurn,
  budgetHealth,
  formatHours,
} from "@/lib/domain/budget";
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
    title: "Project Budgets",
    description: "Planned hours vs project total budget for every project.",
    cta: "Hours and spend against project budgets",
    icon: LineChart,
    column: "right",
  },
  {
    path: "/reports/utilization",
    title: "People Utilization",
    description: "People × weeks heatmap of planned load vs capacity.",
    cta: "Team load vs capacity by week",
    icon: Gauge,
    column: "left",
  },
  {
    path: "/reports/tasks",
    title: "Project Tasks",
    description:
      "Overdue tasks, tasks missing a due date, and recent completions.",
    cta: "Overdue, undated, and recently completed work",
    icon: ClipboardList,
    column: "left",
  },
];

type WeekUtilPoint = {
  key: string;
  label: string;
  pct: number;
  booked: number;
  available: number;
};

export default function ReportsPage() {
  const { state, isPublicShare, ensureOrgHeavyData, mode } = useData();
  const { burns } = useProjectBurnsMap();
  const { effectiveCanManage } = useViewAs();
  const canManage = effectiveCanManage;
  const appHref = useAppHref();
  const budgetHref = useBudgetHref();
  const router = useRouter();
  const now = useMemo(() => new Date(), []);
  const todayKey = toDateKey(now);

  useEffect(() => {
    if (!canManage && !isPublicShare) router.replace(appHref("/dashboard"));
  }, [canManage, isPublicShare, router]);

  useEffect(() => {
    if (mode === "supabase") void ensureOrgHeavyData();
  }, [mode, ensureOrgHeavyData]);

  const plannedHoursAcrossSchedule = useMemo(
    () =>
      state.assignments
        .filter((a) => a.status === "confirmed")
        .reduce((sum, a) => sum + assignmentHours(a), 0),
    [state.assignments],
  );

  const utilization = useMemo(() => {
    const weekAnchors = Array.from({ length: 8 }, (_, i) =>
      weekStart(addWeeks(now, i)),
    );
    const weeks: WeekUtilPoint[] = weekAnchors.map((anchor) => {
      const start = toDateKey(anchor);
      const end = toDateKey(weekEnd(anchor));
      let booked = 0;
      let available = 0;
      for (const person of state.people) {
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
    for (const person of state.people) {
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
      else unavailable += 1; // low + unavailable
    }

    return {
      thisWeek: weeks[0]!,
      weeks,
      healthy,
      near,
      over,
      unavailable,
      peopleCount: state.people.length,
    };
  }, [state.people, state.assignments, state.leave_days, now]);

  const budgets = useMemo(() => {
    let healthy = 0;
    let near = 0;
    let over = 0;
    const rows = state.projects
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
  }, [state.projects, state.assignments, state.people, state.clients, burns]);

  const tasks = useMemo(() => {
    const open = state.tasks.filter((t) => t.status !== "complete");
    const overdue = open.filter((t) => t.due_date && t.due_date < todayKey);
    const noDue = open.filter((t) => !t.due_date);
    const upcoming = open.filter(
      (t) => t.due_date && t.due_date >= todayKey,
    );
    const complete = state.tasks.filter((t) => t.status === "complete");
    return {
      overdue: overdue.length,
      noDue: noDue.length,
      upcoming: upcoming.length,
      complete: complete.length,
      open: open.length,
    };
  }, [state.tasks, todayKey]);

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
      <div className="grid gap-3 p-3 sm:p-5 md:grid-cols-2 md:items-stretch">
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
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--bg-elevated)] text-[var(--accent)]">
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

function MetricRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "muted" | "over" | "near" | "healthy";
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span
        className={cn(
          "tabular-nums font-medium",
          tone === "over" && "text-[var(--status-over)]",
          tone === "near" && "text-[var(--status-near)]",
          tone === "healthy" && "text-[var(--status-healthy)]",
          (!tone || tone === "muted") && "text-[var(--text)]",
        )}
      >
        {value}
      </span>
    </div>
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

  const thisTone =
    data.thisWeek.pct > 100
      ? "over"
      : data.thisWeek.pct >= 95
        ? "near"
        : "healthy";

  const headcount = Math.max(
    1,
    data.healthy + data.near + data.over + data.unavailable,
  );

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] text-[var(--text-muted)]">This week</p>
          <p
            className={cn(
              "text-2xl font-semibold tabular-nums tracking-tight",
              thisTone === "over" && "text-[var(--status-over)]",
              thisTone === "near" && "text-[var(--status-near)]",
              thisTone === "healthy" && "text-[var(--status-healthy)]",
            )}
          >
            {data.peopleCount === 0
              ? "—"
              : `${Math.round(data.thisWeek.pct)}%`}
          </p>
        </div>
        <p className="pb-1 text-right text-[11px] text-[var(--text-muted)]">
          {formatHours(data.thisWeek.booked)} booked
          <br />
          {formatHours(data.thisWeek.available)} available
        </p>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-medium text-[var(--text-muted)]">
          Team utilization · next 8 weeks
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
              const heightPct = Math.max(
                week.pct > 0 ? 4 : 0,
                (week.pct / chartMax) * 100,
              );
              return (
                <div
                  key={week.key}
                  className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
                  title={`${week.label}: ${Math.round(week.pct)}% · ${formatHours(week.booked)} / ${formatHours(week.available)}`}
                >
                  <div
                    className={cn(
                      "w-full max-w-[22px] rounded-t",
                      week.pct > 100
                        ? "bg-[var(--status-over)]"
                        : week.pct >= 95
                          ? "bg-[var(--status-near)]"
                          : "bg-[var(--status-healthy)]",
                      i === 0 && "ring-1 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--bg)]",
                    )}
                    style={{ height: `${heightPct}%` }}
                  />
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
          This week · people by load
        </p>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-[var(--border)]">
          {(
            [
              {
                value: data.healthy,
                className: "bg-[var(--status-healthy)]",
                title: `Healthy: ${data.healthy}`,
              },
              {
                value: data.near,
                className: "bg-[var(--status-near)]",
                title: `Near: ${data.near}`,
              },
              {
                value: data.over,
                className: "bg-[var(--status-over)]",
                title: `Over: ${data.over}`,
              },
              {
                value: data.unavailable,
                className: "bg-[var(--status-unavailable)]",
                title: `Unavailable: ${data.unavailable}`,
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
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[var(--text-muted)]">
          <span>
            <span className="text-[var(--status-healthy)]">{data.healthy}</span>{" "}
            healthy
          </span>
          <span>
            <span className="text-[var(--status-near)]">{data.near}</span> near
          </span>
          <span>
            <span className="text-[var(--status-over)]">{data.over}</span> over
          </span>
          {data.unavailable > 0 ? (
            <span>{data.unavailable} unavailable</span>
          ) : null}
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
      <div className="shrink-0 space-y-1.5">
        <MetricRow label="Tracked projects" value={String(data.tracked)} />
        <MetricRow
          label="Over budget"
          value={String(data.over)}
          tone={data.over > 0 ? "over" : "muted"}
        />
      </div>
      {data.rows.length > 0 ? (
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
          {data.rows.map((row) => (
            <Link
              key={row.id}
              href={budgetHref(row.project)}
              className="block space-y-1 rounded-md px-1 py-0.5 -mx-1 hover:bg-[var(--row-hover)]"
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
        <p className="text-xs text-[var(--text-muted)]">No budgeted projects.</p>
      )}
      <div className="shrink-0 border-t border-[var(--border)] pt-2">
        <MetricRow
          label="Planned across schedule"
          value={formatHours(plannedHours)}
        />
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
    complete: number;
    open: number;
  };
}) {
  const total = Math.max(1, data.overdue + data.noDue + data.upcoming);
  return (
    <div>
      <div className="space-y-1">
        <MetricRow
          label="Overdue"
          value={String(data.overdue)}
          tone={data.overdue > 0 ? "over" : "healthy"}
        />
        <MetricRow label="No due date" value={String(data.noDue)} />
        <MetricRow label="Open" value={String(data.open)} />
      </div>
      <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-[var(--border)]">
        {(
          [
            {
              value: data.overdue,
              className: "bg-[var(--status-over)]",
              title: `Overdue: ${data.overdue}`,
            },
            {
              value: data.noDue,
              className: "bg-[var(--text-muted)]/40",
              title: `No due date: ${data.noDue}`,
            },
            {
              value: data.upcoming,
              className: "bg-[var(--accent)]",
              title: `Upcoming: ${data.upcoming}`,
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
              style={{ width: `${(s.value / total) * 100}%` }}
              title={s.title}
            />
          ))}
      </div>
      <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
        {data.complete} completed · open mix above
      </p>
    </div>
  );
}
