"use client";

import Link from "next/link";
import { BurnBar } from "@/components/ui/burn-bar";
import { useData } from "@/lib/data/store";
import {
  budgetBurn,
  budgetHealth,
  formatHours,
  formatMoney,
} from "@/lib/domain/budget";
import { projectForecast } from "@/lib/domain/forecast";
import { cn } from "@/lib/cn";
import type { Project } from "@/lib/types";

export function BudgetCard({
  project,
  href,
  showName = true,
}: {
  project: Project;
  href: string;
  showName?: boolean;
}) {
  const { state } = useData();
  const burn = budgetBurn(project, state.assignments, state.people);
  const health = budgetHealth(burn);
  const forecast = projectForecast(
    project,
    state.assignments,
    state.people,
  );

  const summary =
    burn.mode === "none"
      ? formatHours(burn.plannedHours)
      : burn.mode === "amount"
        ? `${formatMoney(burn.plannedAmount)} / ${formatMoney(burn.totalAmount ?? 0)}`
        : `${formatHours(burn.plannedHours)} / ${formatHours(burn.totalHours)}${
            burn.overBy > 0 ? ` · ${formatHours(burn.overBy)} over` : ""
          }`;

  return (
    <Link
      id={`project-card-${project.id}`}
      href={href}
      className="flex flex-col rounded-md border border-[var(--border)] bg-[var(--bg)] p-4 transition-colors hover:bg-[var(--row-hover)]"
    >
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
          </div>
          <BurnBar burn={burn} compact />
        </div>
        <div className="border-t border-[var(--border)] pt-3">
          <div className="mb-2 text-xs font-semibold text-[var(--text)]">
            Forecast $
          </div>
          <dl className="space-y-1.5 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-muted)]">Revenue</dt>
              <dd className="tabular-nums font-medium">
                {formatMoney(forecast.revenue)}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-muted)]">Cost</dt>
              <dd className="tabular-nums font-medium">
                {formatMoney(forecast.cost)}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-muted)]">Margin</dt>
              <dd className="tabular-nums font-medium">
                {formatMoney(forecast.margin)} ({forecast.marginPct.toFixed(0)}
                %)
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </Link>
  );
}
