"use client";

import Link from "next/link";
import { BurnBar } from "@/components/ui/burn-bar";
import { panelClass } from "@/components/ui/panel";
import { ProjectYearBurnChart } from "@/components/projects/monthly-retainer-chart";
import { useData } from "@/lib/data/store";
import { useProjectBurnsMap } from "@/lib/hooks/use-aggregates";
import {
  budgetBurn,
  budgetHealth,
  calendarYearBars,
  formatHours,
  formatMoney,
  normalizeBudgetMode,
  projectHoursForecast,
} from "@/lib/domain/budget";
import { cn } from "@/lib/cn";
import type { Project } from "@/lib/types";

export function BudgetCard({
  project,
  href,
  showName = true,
}: {
  project: Project;
  href?: string;
  showName?: boolean;
}) {
  const { state } = useData();
  const { burns } = useProjectBurnsMap();
  const burn =
    burns.get(project.id) ??
    budgetBurn(project, state.assignments, state.people);
  const health = budgetHealth(burn);
  const hoursFx = projectHoursForecast(
    project,
    state.assignments,
    state.people,
  );
  const mode = normalizeBudgetMode(
    project.budget_mode,
    project.budget_hours,
    project.budget_amount,
  );
  const isMonthlyHours =
    mode === "hours" && Boolean(project.budget_monthly_reset);
  const year = new Date().getFullYear();
  const yearBars = isMonthlyHours
    ? calendarYearBars(
        project,
        state.assignments,
        state.people,
        new Date(year, 0, 1),
      )
    : [];

  const summary =
    burn.mode === "none"
      ? formatHours(burn.plannedHours)
      : burn.mode === "amount"
        ? `${formatMoney(burn.plannedAmount)} / ${formatMoney(burn.totalAmount ?? 0)}`
        : `${formatHours(burn.plannedHours)} / ${formatHours(burn.totalHours)}${
            burn.overBy > 0 ? ` · ${formatHours(burn.overBy)} over` : ""
          }`;

  const body = (
    <>
      <div
        className={cn(
          "mb-3 flex min-w-0 items-center gap-2",
          !showName && "justify-end",
        )}
      >
        {showName ? (
          <div className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight">
            {project.name}
          </div>
        ) : null}
        <span className="shrink-0 rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
          {burn.mode === "none"
            ? "No Budget"
            : burn.mode === "amount"
              ? "Dollar"
              : project.budget_monthly_reset
                ? "Monthly Hours"
                : "Hours"}
        </span>
      </div>
      <div className="mt-auto space-y-3">
        <div>
          <div
            className={cn(
              "mb-1.5 text-xs tabular-nums",
              health === "over" && "text-[var(--status-over)]",
              health === "near" && "text-[var(--status-near)]",
              (health === "healthy" || health === "none") &&
                "text-[var(--text-muted)]",
            )}
          >
            {summary}
            {isMonthlyHours ? " · this month" : ""}
          </div>
          {isMonthlyHours ? (
            <ProjectYearBurnChart
              bars={yearBars}
              unit="hours"
              monthlyCap={project.budget_hours ?? 0}
              year={year}
              compact
            />
          ) : (
            <BurnBar burn={burn} compact />
          )}
        </div>
        <div className="border-t border-[var(--border)] pt-3">
          <div className="mb-2 text-xs font-semibold text-[var(--text)]">
            Forecast
          </div>
          <dl className="space-y-1.5 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-muted)]">Hours Used</dt>
              <dd className="tabular-nums font-medium">
                {formatHours(hoursFx.hoursUsedToDate)}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-muted)]">Future Planned</dt>
              <dd className="tabular-nums font-medium">
                {formatHours(hoursFx.hoursFuturePlanned)}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-muted)]">Remaining</dt>
              <dd
                className={cn(
                  "tabular-nums font-medium",
                  hoursFx.overBudget && "text-[var(--status-over)]",
                )}
              >
                {hoursFx.hoursRemaining == null
                  ? "—"
                  : formatHours(hoursFx.hoursRemaining)}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </>
  );

  const className = panelClass({
    className: "flex flex-col transition-colors",
  });

  if (href) {
    return (
      <Link
        id={`project-card-${project.id}`}
        href={href}
        className={cn(className, "hover:bg-[var(--row-hover)]")}
      >
        {body}
      </Link>
    );
  }

  return <div className={className}>{body}</div>;
}
