"use client";

import { cn } from "@/lib/cn";
import { formatHours, type MonthBurnBar } from "@/lib/domain/budget";

/** Bar chart of monthly planned hours vs retainer cap. */
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
  const labelYear = year ?? bars[0]?.year;
  return (
    <div className={cn(className)}>
      <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">
        {labelYear != null
          ? `${labelYear} monthly usage (hours vs retainer)`
          : "Monthly usage (hours vs retainer)"}
      </p>
      <div className="flex h-28 items-end gap-1.5 sm:gap-2">
        {bars.map((bar) => {
          const height = Math.min(
            100,
            Math.max(4, bar.pct || (bar.plannedHours > 0 ? 4 : 0)),
          );
          const over = bar.budgetHours > 0 && bar.plannedHours > bar.budgetHours;
          return (
            <div
              key={bar.key}
              className="flex min-w-0 flex-1 flex-col items-center gap-1"
              title={`${bar.label}: ${formatHours(bar.plannedHours)} / ${formatHours(bar.budgetHours)}`}
            >
              <span className="max-w-full truncate text-[9px] tabular-nums text-[var(--text-muted)] sm:text-[10px]">
                {bar.plannedHours > 0 ? formatHours(bar.plannedHours) : "·"}
              </span>
              <div className="flex h-20 w-full items-end justify-center">
                <div
                  className={cn(
                    "w-full max-w-[28px] rounded-t",
                    over
                      ? "bg-[var(--status-over)]"
                      : bar.plannedHours > 0
                        ? "bg-[var(--accent)]"
                        : "bg-[var(--border)]",
                  )}
                  style={{ height: `${height}%` }}
                />
              </div>
              <span className="truncate text-[9px] text-[var(--text-muted)] sm:text-[10px]">
                {bar.label.split(" ")[0]}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-1 text-[10px] text-[var(--text-muted)]">
        Cap {formatHours(budgetHours)} / month
      </p>
    </div>
  );
}
