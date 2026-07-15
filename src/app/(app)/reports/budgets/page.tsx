"use client";

import Link from "next/link";
import { Topbar } from "@/components/nav/topbar";
import { BurnBar } from "@/components/ui/burn-bar";
import { useData } from "@/lib/data/store";
import {
  budgetBurn,
  budgetHealth,
  formatHours,
  formatMoney,
  monthlyHourBars,
} from "@/lib/domain/budget";
import { sortProjectsByClientThenName } from "@/lib/domain/sorting";
import { cn } from "@/lib/cn";

export default function BudgetsReportPage() {
  const { state } = useData();
  const rows = sortProjectsByClientThenName(state.projects, state.clients).map(
    (project) => ({
      project,
      burn: budgetBurn(project, state.assignments, state.people),
    }),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <Topbar title="Budgets" />
      <div className="space-y-3 p-3 sm:p-5">
        <p className="text-sm text-[var(--text-muted)]">
          Confirmed schedule vs each project&apos;s budget type (hours or
          dollars). Hourly and dollar modes are exclusive — never both. No
          timesheets — the plan is the burn.
        </p>
        {rows.map(({ project, burn }) => {
          const health = budgetHealth(burn);
          const monthBars =
            project.budget_mode === "hours" && project.budget_monthly_reset
              ? monthlyHourBars(project, state.assignments, 6)
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
                  style={{ background: project.color }}
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
              {monthBars && (
                <div
                  className="mt-4"
                  onClick={(e) => e.preventDefault()}
                >
                  <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">
                    Monthly usage (hours used vs retainer)
                  </p>
                  <div className="flex h-28 items-end gap-2">
                    {monthBars.map((bar) => {
                      const height = Math.min(
                        100,
                        Math.max(4, bar.pct || (bar.plannedHours > 0 ? 4 : 0)),
                      );
                      const over = bar.plannedHours > bar.budgetHours;
                      return (
                        <div
                          key={bar.key}
                          className="flex min-w-0 flex-1 flex-col items-center gap-1"
                          title={`${bar.label}: ${formatHours(bar.plannedHours)} / ${formatHours(bar.budgetHours)}`}
                        >
                          <span className="text-[10px] text-[var(--text-muted)]">
                            {formatHours(bar.plannedHours)}
                          </span>
                          <div className="flex h-20 w-full items-end justify-center">
                            <div
                              className={cn(
                                "w-full max-w-[28px] rounded-t",
                                over
                                  ? "bg-[var(--status-over)]"
                                  : "bg-[var(--accent)]",
                              )}
                              style={{ height: `${height}%` }}
                            />
                          </div>
                          <span className="truncate text-[10px] text-[var(--text-muted)]">
                            {bar.label.split(" ")[0]}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                    Cap {formatHours(project.budget_hours ?? 0)} / month
                  </p>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
