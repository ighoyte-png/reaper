"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/nav/page-header";
import { BurnBar } from "@/components/ui/burn-bar";
import { MonthlyRetainerChart } from "@/components/projects/monthly-retainer-chart";
import { useData } from "@/lib/data/store";
import {
  budgetBurn,
  budgetHealth,
  calendarYearHourBars,
  formatHours,
  formatMoney,
} from "@/lib/domain/budget";
import { sortProjectsByClientThenName, projectDisplayColor } from "@/lib/domain/sorting";
import { cn } from "@/lib/cn";

export default function BudgetsReportPage() {
  const { state } = useData();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const earliestYear = useMemo(() => {
    let min = currentYear;
    for (const a of state.assignments) {
      const y = Number(a.start_date.slice(0, 4));
      if (Number.isFinite(y) && y < min) min = y;
    }
    // Allow at least a few years back even with little history.
    return Math.min(min, currentYear - 4);
  }, [state.assignments, currentYear]);

  const rows = sortProjectsByClientThenName(state.projects, state.clients).map(
    (project) => ({
      project,
      burn: budgetBurn(project, state.assignments, state.people),
    }),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <PageHeader
        title="Budgets"
        actions={
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)] disabled:opacity-30"
              aria-label="Previous year"
              disabled={year <= earliestYear}
              onClick={() => setYear((y) => Math.max(earliestYear, y - 1))}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-[4.5rem] text-center text-sm font-medium tabular-nums">
              {year}
            </span>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)] disabled:opacity-30"
              aria-label="Next year"
              disabled={year >= currentYear}
              onClick={() => setYear((y) => Math.min(currentYear, y + 1))}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        }
      />
      <div className="space-y-3 p-3 sm:p-5">
        <p className="text-sm text-[var(--text-muted)]">
          Confirmed schedule vs each project&apos;s budget type (hours or
          dollars). Monthly retainers show Jan–Dec for{" "}
          <span className="font-medium text-[var(--text)]">{year}</span>.
        </p>
        {rows.map(({ project, burn }) => {
          const health = budgetHealth(burn);
          const yearBars =
            project.budget_mode === "hours" && project.budget_monthly_reset
              ? calendarYearHourBars(
                  project,
                  state.assignments,
                  new Date(year, 0, 1),
                )
              : null;
          return (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="block rounded-md border border-[var(--border)] p-4 hover:bg-[var(--row-hover)]"
            >
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    background: projectDisplayColor(project, state.clients),
                  }}
                />
                <span className="text-sm font-semibold">{project.name}</span>
                <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  {burn.mode === "none"
                    ? "No budget"
                    : burn.mode === "amount"
                      ? "Dollar"
                      : project.budget_monthly_reset
                        ? "Monthly hours"
                        : "Hours"}
                </span>
                <span
                  className={cn(
                    "ml-auto text-xs",
                    health === "over" && "text-[var(--status-over)]",
                    health === "near" && "text-[var(--status-near)]",
                    (health === "healthy" || health === "none") &&
                      "text-[var(--text-muted)]",
                  )}
                >
                  {burn.mode === "none"
                    ? formatHours(burn.plannedHours)
                    : burn.mode === "amount"
                      ? `${formatMoney(burn.plannedAmount)} / ${formatMoney(burn.totalAmount ?? 0)}`
                      : `${formatHours(burn.plannedHours)} / ${formatHours(burn.totalHours)}${
                          burn.overBy > 0
                            ? ` · ${formatHours(burn.overBy)} over`
                            : ""
                        }`}
                </span>
              </div>
              <BurnBar burn={burn} />
              {yearBars ? (
                <div
                  className="mt-4"
                  onClick={(e) => e.preventDefault()}
                >
                  <MonthlyRetainerChart
                    bars={yearBars}
                    budgetHours={project.budget_hours ?? 0}
                    year={year}
                  />
                </div>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
