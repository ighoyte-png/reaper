"use client";

import Link from "next/link";
import { useMemo } from "react";
import { addWeeks } from "date-fns";
import {
  ClipboardList,
  Gauge,
  LineChart,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { useData } from "@/lib/data/store";
import { useAppHref } from "@/lib/hooks/use-app-href";
import {
  budgetBurn,
  budgetHealth,
  formatHours,
  formatMoney,
} from "@/lib/domain/budget";
import {
  availableHoursInRange,
  capacityLevel,
  personBookedHoursInRange,
  utilizationPct,
} from "@/lib/domain/capacity";
import { toDateKey, weekEnd, weekStart } from "@/lib/domain/dates";
import { orgForecast } from "@/lib/domain/forecast";
import { cn } from "@/lib/cn";

const reports: {
  path: string;
  title: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    path: "/reports/utilization",
    title: "People Utilization",
    description: "People × weeks heatmap of planned load vs capacity.",
    icon: Gauge,
  },
  {
    path: "/reports/budgets",
    title: "Project Budgets",
    description: "Planned hours vs project total budget for every project.",
    icon: Wallet,
  },
  {
    path: "/reports/tasks",
    title: "Project Tasks",
    description:
      "Overdue tasks, tasks missing a due date, and recent completions.",
    icon: ClipboardList,
  },
  {
    path: "/reports/forecast",
    title: "Financial Forecast",
    description: "Revenue, cost, and margin implied by the schedule.",
    icon: LineChart,
  },
];

export default function ReportsPage() {
  const { state } = useData();
  const appHref = useAppHref();
  const now = useMemo(() => new Date(), []);
  const todayKey = toDateKey(now);

  const utilization = useMemo(() => {
    const weekAnchors = Array.from({ length: 6 }, (_, i) =>
      weekStart(addWeeks(now, i)),
    );
    const weekPcts = weekAnchors.map((anchor) => {
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
      return available <= 0 ? 0 : Math.min(200, utilizationPct(booked, available));
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
      else unavailable += 1;
    }

    return {
      thisWeekPct: weekPcts[0] ?? 0,
      weekPcts,
      healthy,
      near,
      over,
      unavailable,
      peopleCount: state.people.length,
    };
  }, [state.people, state.assignments, state.leave_days, now]);

  const budgets = useMemo(() => {
    const tracked = state.projects.filter((p) => {
      const burn = budgetBurn(p, state.assignments, state.people);
      return burn.mode !== "none";
    });
    let healthy = 0;
    let near = 0;
    let over = 0;
    const top = tracked
      .map((p) => {
        const burn = budgetBurn(p, state.assignments, state.people);
        const health = budgetHealth(burn);
        if (health === "healthy") healthy += 1;
        else if (health === "near") near += 1;
        else if (health === "over") over += 1;
        return { name: p.name, pct: burn.pct, health };
      })
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5);
    return {
      tracked: tracked.length,
      healthy,
      near,
      over,
      top,
    };
  }, [state.projects, state.assignments, state.people]);

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

  const forecast = useMemo(
    () => orgForecast(state.projects, state.assignments, state.people),
    [state.projects, state.assignments, state.people],
  );

  return (
    <PageContainer className="overflow-y-auto">
      <PageHeader title="Reports" />
      <div className="grid gap-3 p-3 sm:p-5 md:grid-cols-2">
        {reports.map((report) => {
          const Icon = report.icon;
          return (
            <Link
              key={report.path}
              href={appHref(report.path)}
              className="flex flex-col rounded-md border border-[var(--border)] bg-[var(--bg)] p-4 transition-colors hover:bg-[var(--row-hover)]"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--bg-elevated)] text-[var(--accent)]">
                  <Icon size={18} strokeWidth={1.75} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold">{report.title}</h2>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {report.description}
                  </p>
                </div>
              </div>

              <div className="mt-4 border-t border-[var(--border)] pt-3">
                {report.path === "/reports/utilization" ? (
                  <UtilizationOverview data={utilization} />
                ) : null}
                {report.path === "/reports/budgets" ? (
                  <BudgetsOverview data={budgets} />
                ) : null}
                {report.path === "/reports/tasks" ? (
                  <TasksOverview data={tasks} />
                ) : null}
                {report.path === "/reports/forecast" ? (
                  <ForecastOverview forecast={forecast} />
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
    </PageContainer>
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
    thisWeekPct: number;
    weekPcts: number[];
    healthy: number;
    near: number;
    over: number;
    unavailable: number;
    peopleCount: number;
  };
}) {
  const max = Math.max(...data.weekPcts, 100);
  return (
    <div className="space-y-3">
      <MetricRow
        label="This week"
        value={
          data.peopleCount === 0
            ? "—"
            : `${Math.round(data.thisWeekPct)}% utilized`
        }
        tone={
          data.thisWeekPct > 100
            ? "over"
            : data.thisWeekPct >= 95
              ? "near"
              : "healthy"
        }
      />
      <div className="flex h-16 items-end gap-1">
        {data.weekPcts.map((pct, i) => (
          <div
            key={i}
            className="flex min-w-0 flex-1 flex-col items-center justify-end"
            title={`Week ${i === 0 ? "this" : `+${i}`}: ${Math.round(pct)}%`}
          >
            <div
              className={cn(
                "w-full max-w-[28px] rounded-t",
                pct > 100
                  ? "bg-[var(--status-over)]"
                  : pct >= 95
                    ? "bg-[var(--status-near)]"
                    : "bg-[var(--status-healthy)]",
              )}
              style={{
                height: `${Math.max(pct > 0 ? 8 : 2, (pct / max) * 100)}%`,
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)]">
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
      </div>
    </div>
  );
}

function BudgetsOverview({
  data,
}: {
  data: {
    tracked: number;
    healthy: number;
    near: number;
    over: number;
    top: { name: string; pct: number; health: string }[];
  };
}) {
  return (
    <div className="space-y-3">
      <MetricRow
        label="Tracked projects"
        value={String(data.tracked)}
      />
      <MetricRow
        label="Over budget"
        value={String(data.over)}
        tone={data.over > 0 ? "over" : "muted"}
      />
      {data.top.length > 0 ? (
        <div className="space-y-1.5">
          {data.top.map((row) => (
            <div key={row.name} className="space-y-0.5">
              <div className="flex justify-between gap-2 text-[11px]">
                <span className="truncate text-[var(--text-muted)]">
                  {row.name}
                </span>
                <span className="shrink-0 tabular-nums">
                  {Math.round(row.pct)}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
                <div
                  className={cn(
                    "h-full rounded-full",
                    row.health === "over" && "bg-[var(--status-over)]",
                    row.health === "near" && "bg-[var(--status-near)]",
                    (row.health === "healthy" || row.health === "none") &&
                      "bg-[var(--accent)]",
                  )}
                  style={{ width: `${Math.min(100, row.pct)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-[var(--text-muted)]">No budgeted projects.</p>
      )}
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
    <div className="space-y-3">
      <MetricRow
        label="Overdue"
        value={String(data.overdue)}
        tone={data.overdue > 0 ? "over" : "healthy"}
      />
      <MetricRow label="No due date" value={String(data.noDue)} />
      <MetricRow label="Open" value={String(data.open)} />
      <div className="flex h-3 overflow-hidden rounded-full bg-[var(--border)]">
        <div
          className="bg-[var(--status-over)]"
          style={{ width: `${(data.overdue / total) * 100}%` }}
          title={`Overdue: ${data.overdue}`}
        />
        <div
          className="bg-[var(--text-muted)]/40"
          style={{ width: `${(data.noDue / total) * 100}%` }}
          title={`No due date: ${data.noDue}`}
        />
        <div
          className="bg-[var(--accent)]"
          style={{ width: `${(data.upcoming / total) * 100}%` }}
          title={`Upcoming: ${data.upcoming}`}
        />
      </div>
      <p className="text-[11px] text-[var(--text-muted)]">
        {data.complete} completed · open mix above
      </p>
    </div>
  );
}

function ForecastOverview({
  forecast,
}: {
  forecast: ReturnType<typeof orgForecast>;
}) {
  const max = Math.max(forecast.revenue, forecast.cost, 1);
  return (
    <div className="space-y-3">
      <MetricRow label="Revenue" value={formatMoney(forecast.revenue)} />
      <MetricRow label="Cost" value={formatMoney(forecast.cost)} />
      <MetricRow
        label="Margin"
        value={`${formatMoney(forecast.margin)} (${Math.round(forecast.marginPct)}%)`}
        tone={forecast.margin < 0 ? "over" : "healthy"}
      />
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-[11px] text-[var(--text-muted)]">
            Revenue
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--border)]">
            <div
              className="h-full rounded-full bg-[var(--accent)]"
              style={{ width: `${(forecast.revenue / max) * 100}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-[11px] text-[var(--text-muted)]">
            Cost
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--border)]">
            <div
              className="h-full rounded-full bg-[var(--text-muted)]/50"
              style={{ width: `${(forecast.cost / max) * 100}%` }}
            />
          </div>
        </div>
      </div>
      <p className="text-[11px] text-[var(--text-muted)]">
        {formatHours(forecast.plannedHours)} planned across schedule
      </p>
    </div>
  );
}
