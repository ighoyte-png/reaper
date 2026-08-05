"use client";

import { cn } from "@/lib/cn";
import {
  formatHours,
  formatMoney,
  type MonthBurnBar,
} from "@/lib/domain/budget";

function isCurrentMonth(year: number, monthIndex: number, asOf = new Date()) {
  return year === asOf.getFullYear() && monthIndex === asOf.getMonth();
}

function isFutureMonth(year: number, monthIndex: number, asOf = new Date()) {
  const y = asOf.getFullYear();
  const m = asOf.getMonth();
  return year > y || (year === y && monthIndex > m);
}

const hatchStyle = {
  backgroundImage:
    "repeating-linear-gradient(-45deg, transparent, transparent 3px, var(--progress-approved-hatch) 3px, var(--progress-approved-hatch) 5px)",
} as const;

function barSplit(
  bar: MonthBurnBar,
  unit: "hours" | "amount",
): {
  used: number;
  future: number;
  contractor: number;
  total: number;
} {
  if (unit === "amount") {
    const contractor = bar.contractorAmount;
    const used = bar.usedAmount;
    const future = bar.futureAmount;
    return { used, future, contractor, total: used + future + contractor };
  }
  const contractor = bar.contractorHours;
  const used = bar.usedHours;
  const future = bar.futureHours;
  return { used, future, contractor, total: used + future + contractor };
}

const contractorColor = "var(--status-healthy)";

function MonthBarColumn({
  bar,
  unit,
  total,
  used,
  future,
  contractor,
  maxValue,
  cap,
  showCapLine,
  compact,
  selected,
  onMonthSelect,
}: {
  bar: MonthBurnBar;
  unit: "hours" | "amount";
  total: number;
  used: number;
  future: number;
  contractor: number;
  maxValue: number;
  cap: number;
  showCapLine: boolean;
  compact: boolean;
  selected: boolean;
  onMonthSelect?: (bar: MonthBurnBar) => void;
}) {
  const asOf = new Date();
  const current = isCurrentMonth(bar.year, bar.monthIndex, asOf);
  const futureMonth = isFutureMonth(bar.year, bar.monthIndex, asOf);

  const valuePct =
    maxValue <= 0 ? 0 : Math.min(100, Math.max(0, (total / maxValue) * 100));
  const withinCap = Math.min(total, cap > 0 ? cap : total);
  const overCap = cap > 0 ? Math.max(0, total - cap) : 0;
  const withinPct =
    maxValue <= 0 ? 0 : Math.min(100, (withinCap / maxValue) * 100);
  const overPct =
    maxValue <= 0 ? 0 : Math.min(100, (overCap / maxValue) * 100);

  function formatValue(n: number): string {
    if (unit === "amount") return formatMoney(n);
    return formatHours(n);
  }

  const showSplit = current && used > 0 && future > 0;
  const hasContractor = contractor > 0;

  function renderInternalBar(heightPct: number) {
    if (showSplit) {
      const internalTotal = used + future;
      const usedPct = internalTotal > 0 ? (used / internalTotal) * 100 : 0;
      const futurePct = internalTotal > 0 ? (future / internalTotal) * 100 : 0;
      return (
        <div
          className="relative flex w-full flex-col justify-end overflow-hidden"
          style={{ height: `${heightPct}%` }}
        >
          <div
            className="relative w-full overflow-hidden bg-[var(--accent)]"
            style={{ height: `${futurePct}%` }}
          >
            <div className="absolute inset-0" style={hatchStyle} aria-hidden />
          </div>
          <div
            className="w-full bg-[var(--accent)]"
            style={{ height: `${usedPct}%` }}
          />
        </div>
      );
    }

    const hatched = futureMonth || (current && future > 0 && used <= 0);
    return (
      <div
        className="relative w-full overflow-hidden bg-[var(--accent)]"
        style={{ height: `${heightPct}%` }}
      >
        {hatched ? (
          <div className="absolute inset-0" style={hatchStyle} aria-hidden />
        ) : null}
      </div>
    );
  }

  function renderStackedBar(heightPct: number) {
    const contractorPct = total > 0 ? (contractor / total) * 100 : 0;
    const internalPct = total > 0 ? ((used + future) / total) * 100 : 0;
    return (
      <div
        className="relative flex w-full flex-col justify-end overflow-hidden"
        style={{ height: `${heightPct}%` }}
      >
        {hasContractor ? (
          <div
            className="w-full shrink-0"
            style={{
              height: `${contractorPct}%`,
              backgroundColor: contractorColor,
            }}
          />
        ) : null}
        {internalPct > 0 ? (
          <div className="min-h-0 w-full flex-1">
            {renderInternalBar(100)}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      role={onMonthSelect ? "button" : undefined}
      tabIndex={onMonthSelect ? 0 : undefined}
      onClick={onMonthSelect ? () => onMonthSelect(bar) : undefined}
      onKeyDown={
        onMonthSelect
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onMonthSelect(bar);
              }
            }
          : undefined
      }
      className={cn(
        "relative flex h-full min-w-0 flex-1 items-end justify-center",
        onMonthSelect && "cursor-pointer",
        selected && "rounded-t ring-2 ring-[var(--accent)] ring-offset-1",
      )}
      title={`${bar.label}: ${formatValue(total)}${
        cap > 0 ? ` / ${formatValue(cap)}` : ""
      }${futureMonth ? " (planned)" : ""}`}
    >
      {total <= 0 ? (
        <div
          className={cn(
            "w-full rounded-t bg-[var(--border)]",
            compact ? "max-w-[28px] h-0.5" : "max-w-[37px] h-1",
          )}
        />
      ) : showCapLine && overCap > 0 ? (
        <div
          className={cn(
            "relative flex w-full flex-col justify-end overflow-hidden rounded-t",
            compact ? "max-w-[28px]" : "max-w-[37px]",
          )}
          style={{ height: `${valuePct}%` }}
        >
          <div
            className="w-full bg-[var(--status-over)]"
            style={{ height: `${(overPct / valuePct) * 100}%` }}
          />
          {hasContractor ? renderStackedBar((withinPct / valuePct) * 100) : renderInternalBar((withinPct / valuePct) * 100)}
        </div>
      ) : (
        <div
          className={cn(
            "relative flex w-full flex-col justify-end overflow-hidden rounded-t",
            compact ? "max-w-[28px]" : "max-w-[37px]",
          )}
          style={{ height: `${Math.max(valuePct, 4)}%` }}
        >
          {hasContractor ? renderStackedBar(100) : renderInternalBar(100)}
        </div>
      )}
    </div>
  );
}

/** Calendar-year (or trailing-month) bar chart of planned burn. */
export function ProjectYearBurnChart({
  bars,
  unit = "hours",
  monthlyCap,
  year,
  className,
  compact = false,
  selectedMonthKey,
  onMonthSelect,
}: {
  bars: MonthBurnBar[];
  unit?: "hours" | "amount";
  /** Soft monthly cap for over-coloring (retainer hours). */
  monthlyCap?: number;
  year?: number;
  className?: string;
  /** Tighter layout for client portal. */
  compact?: boolean;
  /** Highlight a month bar (yyyy-MM). */
  selectedMonthKey?: string;
  onMonthSelect?: (bar: MonthBurnBar) => void;
}) {
  const labelYear = year ?? bars[0]?.year;
  const cap = monthlyCap ?? 0;
  const maxValue = Math.max(
    cap,
    ...bars.map((b) => barSplit(b, unit).total),
    unit === "hours" ? 1 : 1,
  );
  const capPct = maxValue <= 0 ? 0 : (cap / maxValue) * 100;
  const showCapLine = unit === "hours" && cap > 0;
  const hasContractor = bars.some((b) =>
    unit === "amount" ? b.contractorAmount > 0 : b.contractorHours > 0,
  );

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
        {bars.map((bar) => {
          const { total } = barSplit(bar, unit);
          return (
            <div
              key={`v-${bar.key}`}
              className="min-w-0 flex-1 text-center"
              title={`${bar.label}: ${formatValue(total)}${
                cap > 0 ? ` / ${formatValue(cap)}` : ""
              }`}
            >
              <span
                className={cn(
                  "block max-w-full truncate tabular-nums text-[var(--text-muted)]",
                  compact ? "text-[8px]" : "text-[9px] sm:text-[10px]",
                )}
              >
                {total > 0 ? formatValue(total) : "·"}
              </span>
            </div>
          );
        })}
      </div>
      <div
        className={cn(
          "relative flex gap-1.5 sm:gap-2",
          compact ? "h-16" : "h-44",
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
          const { used, future, contractor, total } = barSplit(bar, unit);
          return (
            <MonthBarColumn
              key={bar.key}
              bar={bar}
              unit={unit}
              total={total}
              used={used}
              future={future}
              contractor={contractor}
              maxValue={maxValue}
              cap={cap}
              showCapLine={showCapLine}
              compact={compact}
              selected={selectedMonthKey === bar.key}
              onMonthSelect={onMonthSelect}
            />
          );
        })}
      </div>
      <div className="mt-1 flex gap-1.5 sm:gap-2">
        {bars.map((bar) => (
          <div key={`l-${bar.key}`} className="min-w-0 flex-1 text-center">
            <span
              className={cn(
                "block truncate text-[var(--text-muted)]",
                compact ? "text-[8px]" : "text-[8px] sm:text-[10px]",
                unit === "hours" &&
                  isFutureMonth(bar.year, bar.monthIndex) &&
                  "italic",
                selectedMonthKey === bar.key &&
                  "font-semibold text-[var(--text)]",
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
            <span className="ml-2">· hatched = future / planned</span>
            {hasContractor ? (
              <span className="ml-2">
                ·{" "}
                <span
                  className="inline-block h-2 w-2 rounded-full align-middle"
                  style={{ backgroundColor: contractorColor }}
                />{" "}
                contractor
              </span>
            ) : null}
          </p>
        ) : (
          <p className="mt-1 text-[10px] text-[var(--text-muted)]">
            {unit === "amount"
              ? "Planned billable spend by month"
              : "Planned hours by month"}
            {hasContractor ? (
              <span className="ml-2">
                ·{" "}
                <span
                  className="inline-block h-2 w-2 rounded-full align-middle"
                  style={{ backgroundColor: contractorColor }}
                />{" "}
                contractor ·{" "}
                <span className="inline-block h-2 w-2 rounded-full bg-[var(--accent)] align-middle" />{" "}
                internal
              </span>
            ) : null}
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
