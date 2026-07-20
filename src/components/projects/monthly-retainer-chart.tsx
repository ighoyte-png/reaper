"use client";

import { cn } from "@/lib/cn";
import {
  formatHours,
  formatMoney,
  type MonthBurnBar,
} from "@/lib/domain/budget";

/** Calendar-year (or trailing-month) bar chart of planned burn. */
export function ProjectYearBurnChart({
  bars,
  unit = "hours",
  monthlyCap,
  year,
  className,
}: {
  bars: MonthBurnBar[];
  unit?: "hours" | "amount";
  /** Soft monthly cap for over-coloring (retainer hours). */
  monthlyCap?: number;
  year?: number;
  className?: string;
}) {
  const labelYear = year ?? bars[0]?.year;
  const cap = monthlyCap ?? 0;
  const maxValue = Math.max(
    cap,
    ...bars.map((b) => b.value),
    unit === "hours" ? 1 : 1,
  );

  function formatValue(n: number): string {
    if (unit === "amount") return formatMoney(n);
    return formatHours(n);
  }

  return (
    <div className={cn(className)}>
      <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">
        {labelYear != null
          ? `${labelYear} monthly ${unit === "amount" ? "spend" : "usage"}`
          : `Monthly ${unit === "amount" ? "spend" : "usage"}`}
      </p>
      <div className="flex h-36 items-end gap-1.5 sm:gap-2">
        {bars.map((bar) => {
          const over = cap > 0 && bar.value > cap;
          const heightPct =
            maxValue <= 0
              ? 0
              : Math.min(100, Math.max(bar.value > 0 ? 4 : 0, (bar.value / maxValue) * 100));
          return (
            <div
              key={bar.key}
              className="flex min-w-0 flex-1 flex-col items-center gap-1"
              title={`${bar.label}: ${formatValue(bar.value)}${
                cap > 0 ? ` / ${formatValue(cap)}` : ""
              }`}
            >
              <span className="max-w-full truncate text-[9px] tabular-nums text-[var(--text-muted)] sm:text-[10px]">
                {bar.value > 0 ? formatValue(bar.value) : "·"}
              </span>
              <div className="flex h-24 w-full items-end justify-center">
                <div
                  className={cn(
                    "w-full max-w-[37px] rounded-t",
                    over
                      ? "bg-[var(--status-over)]"
                      : bar.value > 0
                        ? "bg-[var(--accent)]"
                        : "bg-[var(--border)]",
                  )}
                  style={{ height: `${heightPct}%` }}
                />
              </div>
              <span className="truncate text-[9px] text-[var(--text-muted)] sm:text-[10px]">
                {bar.label.split(" ")[0]}
              </span>
            </div>
          );
        })}
      </div>
      {cap > 0 ? (
        <p className="mt-1 text-[10px] text-[var(--text-muted)]">
          Monthly cap {formatValue(cap)}
        </p>
      ) : (
        <p className="mt-1 text-[10px] text-[var(--text-muted)]">
          {unit === "amount"
            ? "Planned billable spend by month"
            : "Planned hours by month"}
        </p>
      )}
    </div>
  );
}

/** @deprecated Prefer ProjectYearBurnChart */
export function MonthlyRetainerChart({
  bars,
  budgetHours,
  year,
  className,
}: {
  bars: MonthBurnBar[];
  budgetHours: number;
  year?: number;
  className?: string;
}) {
  return (
    <ProjectYearBurnChart
      bars={bars}
      unit="hours"
      monthlyCap={budgetHours}
      year={year}
      className={className}
    />
  );
}
