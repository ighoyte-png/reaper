"use client";

import { cn } from "@/lib/cn";
import {
  formatHours,
  formatMoney,
  type MonthBurnBar,
} from "@/lib/domain/budget";

function isFutureMonth(year: number, monthIndex: number, asOf = new Date()) {
  const y = asOf.getFullYear();
  const m = asOf.getMonth();
  return year > y || (year === y && monthIndex > m);
}

/** Calendar-year (or trailing-month) bar chart of planned burn. */
export function ProjectYearBurnChart({
  bars,
  unit = "hours",
  monthlyCap,
  year,
  className,
  compact = false,
}: {
  bars: MonthBurnBar[];
  unit?: "hours" | "amount";
  /** Soft monthly cap for over-coloring (retainer hours). */
  monthlyCap?: number;
  year?: number;
  className?: string;
  /** Tighter layout for client portal. */
  compact?: boolean;
}) {
  const labelYear = year ?? bars[0]?.year;
  const cap = monthlyCap ?? 0;
  const maxValue = Math.max(
    cap,
    ...bars.map((b) => b.value),
    unit === "hours" ? 1 : 1,
  );
  const capPct = maxValue <= 0 ? 0 : (cap / maxValue) * 100;
  const showCapLine = unit === "hours" && cap > 0;

  function formatValue(n: number): string {
    if (unit === "amount") return formatMoney(n);
    return formatHours(n);
  }

  return (
    <div className={cn(className)}>
      {!compact ? (
        <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">
          {labelYear != null
            ? `${labelYear} monthly ${unit === "amount" ? "spend" : "usage"}`
            : `Monthly ${unit === "amount" ? "spend" : "usage"}`}
        </p>
      ) : null}
      <div
        className={cn(
          "flex items-end gap-1.5 sm:gap-2",
          compact ? "mb-0.5 h-4" : "mb-1",
        )}
      >
        {bars.map((bar) => (
          <div
            key={`v-${bar.key}`}
            className="min-w-0 flex-1 text-center"
            title={`${bar.label}: ${formatValue(bar.value)}${
              cap > 0 ? ` / ${formatValue(cap)}` : ""
            }`}
          >
            <span
              className={cn(
                "block max-w-full truncate tabular-nums text-[var(--text-muted)]",
                compact ? "text-[8px]" : "text-[9px] sm:text-[10px]",
              )}
            >
              {bar.value > 0 ? formatValue(bar.value) : "·"}
            </span>
          </div>
        ))}
      </div>
      <div
        className={cn(
          "relative flex items-end gap-1.5 sm:gap-2",
          compact ? "h-16" : "h-24",
        )}
      >
        {showCapLine ? (
          <div
            className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-[#ef4444]"
            style={{ bottom: `${capPct}%` }}
            aria-hidden
          />
        ) : null}
        {bars.map((bar) => {
          const over = cap > 0 && bar.value > cap;
          const future = isFutureMonth(bar.year, bar.monthIndex);
          const heightPct =
            maxValue <= 0
              ? 0
              : Math.min(
                  100,
                  Math.max(bar.value > 0 ? 4 : 0, (bar.value / maxValue) * 100),
                );
          return (
            <div
              key={bar.key}
              className="flex min-w-0 flex-1 items-end justify-center"
              title={`${bar.label}: ${formatValue(bar.value)}${
                cap > 0 ? ` / ${formatValue(cap)}` : ""
              }${future ? " (planned)" : ""}`}
            >
              <div
                className={cn(
                  "relative w-full overflow-hidden rounded-t",
                  compact ? "max-w-[28px]" : "max-w-[37px]",
                  over
                    ? "bg-[var(--status-over)]"
                    : bar.value > 0
                      ? "bg-[var(--accent)]"
                      : "bg-[var(--border)]",
                )}
                style={{ height: `${heightPct}%` }}
              >
                {unit === "hours" && future && bar.value > 0 ? (
                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(-45deg, transparent, transparent 3px, var(--progress-approved-hatch) 3px, var(--progress-approved-hatch) 5px)",
                    }}
                    aria-hidden
                  />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1.5 sm:gap-2">
        {bars.map((bar) => (
          <div key={`l-${bar.key}`} className="min-w-0 flex-1 text-center">
            <span
              className={cn(
                "block truncate text-[var(--text-muted)]",
                compact ? "text-[8px]" : "text-[9px] sm:text-[10px]",
              )}
            >
              {bar.label.split(" ")[0]}
            </span>
          </div>
        ))}
      </div>
      {!compact ? (
        showCapLine ? (
          <p className="mt-1 text-[10px] text-[var(--text-muted)]">
            Monthly cap {formatValue(cap)}
            <span className="ml-1 text-[#ef4444]">— —</span>
          </p>
        ) : (
          <p className="mt-1 text-[10px] text-[var(--text-muted)]">
            {unit === "amount"
              ? "Planned billable spend by month"
              : "Planned hours by month"}
          </p>
        )
      ) : null}
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
