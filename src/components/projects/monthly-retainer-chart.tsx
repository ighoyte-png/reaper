"use client";

import { format } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";
import { BudgetChartLegend } from "@/components/budgets/budget-chart-legend";
import { cn } from "@/lib/cn";
import {
  CHART_BUDGET_DASH,
  CHART_BUDGET_STROKE,
  CHART_HOVER_TOP_STROKE,
  CHART_TARGET_STROKE,
} from "@/components/budgets/chart-hover";
import {
  ChartHoverTooltip,
  useColumnAnchor,
} from "@/components/budgets/chart-hover";
import {
  formatHours,
  formatMoney,
  type MonthBurnBar,
} from "@/lib/domain/budget";
import { useIsPhone } from "@/lib/hooks/use-media-query";

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
  contractorUsed: number;
  contractorFuture: number;
  contractor: number;
  total: number;
} {
  if (unit === "amount") {
    const contractorUsed = bar.contractorUsedAmount;
    const contractorFuture = bar.contractorFutureAmount;
    const contractor = contractorUsed + contractorFuture;
    const used = bar.usedAmount;
    const future = bar.futureAmount;
    return {
      used,
      future,
      contractorUsed,
      contractorFuture,
      contractor,
      total: used + future + contractor,
    };
  }
  const contractorUsed = bar.contractorUsedHours;
  const contractorFuture = bar.contractorFutureHours;
  const contractor = contractorUsed + contractorFuture;
  const used = bar.usedHours;
  const future = bar.futureHours;
  return {
    used,
    future,
    contractorUsed,
    contractorFuture,
    contractor,
    total: used + future + contractor,
  };
}

const contractorColor = "var(--status-healthy)";

function MonthBarColumn({
  bar,
  unit,
  total,
  used,
  future,
  contractorUsed,
  contractorFuture,
  contractor,
  maxValue,
  cap,
  showCapLine: _showCapLine,
  compact,
  selected,
  currentMonth: _currentMonth,
  isHovered,
  interactive,
  onHoverStart,
  onMonthSelect,
}: {
  bar: MonthBurnBar;
  unit: "hours" | "amount";
  total: number;
  used: number;
  future: number;
  contractorUsed: number;
  contractorFuture: number;
  contractor: number;
  maxValue: number;
  cap: number;
  showCapLine: boolean;
  compact: boolean;
  selected: boolean;
  currentMonth: boolean;
  isHovered: boolean;
  interactive: boolean;
  onHoverStart?: (el: HTMLDivElement) => void;
  onMonthSelect?: (bar: MonthBurnBar) => void;
}) {
  const futureMonth = isFutureMonth(bar.year, bar.monthIndex, new Date());

  const valuePct =
    maxValue <= 0 ? 0 : Math.min(100, Math.max(0, (total / maxValue) * 100));

  function formatValue(n: number): string {
    if (unit === "amount") return formatMoney(n);
    return formatHours(n);
  }

  const hasContractor = contractor > 0;

  /**
   * Paint from the bottom of the bar in absolute hours so the budget cap
   * (red line) always splits blue/green below from red above — including
   * when a contractor segment sits under internal hours.
   */
  function renderBurnStack(heightPct: number) {
    type Band = {
      h: number;
      kind: "used" | "future" | "c-used" | "c-future";
    };
    const bands: Band[] = [];
    if (hasContractor) {
      if (contractorUsed > 0) bands.push({ h: contractorUsed, kind: "c-used" });
      if (contractorFuture > 0) {
        bands.push({ h: contractorFuture, kind: "c-future" });
      }
    }
    if (used > 0) bands.push({ h: used, kind: "used" });
    if (future > 0) bands.push({ h: future, kind: "future" });

    const hasCap = cap > 0;
    const parts: Array<{ h: number; color: string; hatch: boolean }> = [];
    let cursor = 0;

    for (const band of bands) {
      let remaining = band.h;
      while (remaining > 0.0001) {
        const hatch = band.kind === "future" || band.kind === "c-future";
        const underColor =
          band.kind === "c-used" || band.kind === "c-future"
            ? contractorColor
            : "var(--accent)";
        // No budget line — paint the full band in used/planned colors.
        if (!hasCap) {
          parts.push({ h: remaining, color: underColor, hatch });
          cursor += remaining;
          remaining = 0;
          continue;
        }
        const underRoom = Math.max(0, cap - cursor);
        if (cursor < cap && underRoom > 0) {
          const takeUnder = Math.min(remaining, underRoom);
          parts.push({ h: takeUnder, color: underColor, hatch });
          cursor += takeUnder;
          remaining -= takeUnder;
          continue;
        }
        // Above the budget line — always solid/hatched over-budget red.
        parts.push({
          h: remaining,
          color: "var(--status-over)",
          hatch,
        });
        cursor += remaining;
        remaining = 0;
      }
    }

    if (parts.length === 0) {
      return <div className="w-full" style={{ height: `${heightPct}%` }} />;
    }

    const stackTotal = parts.reduce((s, p) => s + p.h, 0) || 1;
    // flex-col justify-end: last DOM child at bottom.
    const ordered = [...parts].reverse();

    return (
      <div
        className="relative flex w-full flex-col justify-end overflow-hidden"
        style={{ height: `${heightPct}%` }}
      >
        {ordered.map((p, i) => (
          <div
            key={`${p.color}-${p.hatch}-${i}`}
            className="relative w-full overflow-hidden"
            style={{
              height: `${(p.h / stackTotal) * 100}%`,
              backgroundColor: p.color,
            }}
          >
            {p.hatch ? (
              <div className="absolute inset-0" style={hatchStyle} aria-hidden />
            ) : null}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      role={interactive && onMonthSelect ? "button" : undefined}
      tabIndex={interactive && onMonthSelect ? 0 : undefined}
      onClick={interactive && onMonthSelect ? () => onMonthSelect(bar) : undefined}
      onMouseEnter={interactive && onHoverStart ? (e) => onHoverStart(e.currentTarget) : undefined}
      onKeyDown={
        interactive && onMonthSelect
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
        interactive && onMonthSelect && "cursor-pointer",
      )}
      title={
        interactive && onHoverStart
          ? undefined
          : `${bar.label}: ${formatValue(total)}${
              cap > 0 ? ` / ${formatValue(cap)}` : ""
            }${futureMonth ? " (planned)" : ""}`
      }
    >
      {selected && !isHovered ? (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 top-0 z-[1] bg-[var(--accent)]/18"
          aria-hidden
        />
      ) : null}
      {interactive && isHovered ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 top-0 z-[2] overflow-hidden" aria-hidden>
          <svg className="h-full w-full" preserveAspectRatio="none">
            <defs>
              <pattern id={`month-hover-${bar.key}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
                <line x1="0" y1="0" x2="0" y2="6" stroke="var(--accent)" strokeWidth="2" strokeOpacity="0.32" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#month-hover-${bar.key})`} />
            <rect width="100%" height="100%" fill="var(--accent)" fillOpacity="0.06" />
          </svg>
          <div
            className="absolute inset-x-0 top-0 bg-[var(--accent)]"
            style={{ height: CHART_HOVER_TOP_STROKE }}
          />
        </div>
      ) : null}
      {total <= 0 ? (
        <div
          className={cn(
            "relative z-[1] w-full rounded-t bg-[var(--border)]",
            compact ? "max-w-[28px] h-0.5" : "max-w-[37px] h-1",
          )}
        />
      ) : (
        <div
          className={cn(
            "relative z-[1] flex w-full flex-col justify-end overflow-hidden rounded-t",
            compact ? "max-w-[28px]" : "max-w-[37px]",
          )}
          style={{ height: `${Math.max(valuePct, 4)}%` }}
        >
          {renderBurnStack(100)}
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
  blendContractors = false,
  interactive = !compact,
  profitLine = null,
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
  /** Paint contractor hours as internal (blue) — client portal only. */
  blendContractors?: boolean;
  /** Hover tooltips and month click — full budget report only. */
  interactive?: boolean;
  /** Target cost line for dollar retainers (e.g. 75% of monthly fee). */
  profitLine?: number | null;
}) {
  const isPhone = useIsPhone();
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentBarRef = useRef<HTMLDivElement>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [hoverColumnEl, setHoverColumnEl] = useState<HTMLDivElement | null>(null);

  const displayBars = useMemo(() => {
    if (!isPhone || bars.length <= 6) return bars;
    const nowKey = format(new Date(), "yyyy-MM");
    const idx = bars.findIndex((b) => b.key === nowKey);
    if (idx >= 0) {
      const end = Math.min(bars.length, Math.max(idx + 1, 6));
      const start = Math.max(0, end - 6);
      return bars.slice(start, start + 6);
    }
    return bars.slice(-6);
  }, [bars, isPhone]);

  const uniqueYears = new Set(displayBars.map((b) => b.year));
  const labelYear =
    year !== undefined
      ? year
      : uniqueYears.size === 1
        ? displayBars[0]?.year
        : undefined;
  const barMinPx = compact ? 28 : 36;
  const chartMinWidth = displayBars.length * barMinPx;
  const multiYear = uniqueYears.size > 1;
  const cap = monthlyCap ?? 0;
  const maxValue = Math.max(
    cap,
    ...displayBars.map((b) => barSplit(b, unit).total),
    unit === "hours" ? 1 : 1,
  );
  const capPct = maxValue <= 0 ? 0 : (cap / maxValue) * 100;
  const profitPct =
    profitLine != null && profitLine > 0 && maxValue > 0
      ? (profitLine / maxValue) * 100
      : 0;
  const showCapLine = cap > 0;
  const showProfitLine = profitLine != null && profitLine > 0;
  const hasContractor =
    !blendContractors &&
    displayBars.some((b) =>
      unit === "amount" ? b.contractorAmount > 0 : b.contractorHours > 0,
    );
  const nowKey = format(new Date(), "yyyy-MM");
  const hoverBar =
    hoverKey != null
      ? displayBars.find((bar) => bar.key === hoverKey) ?? null
      : null;
  const hoverIdx =
    hoverBar != null
      ? displayBars.findIndex((bar) => bar.key === hoverBar.key)
      : -1;

  const tooltipAnchor = useColumnAnchor(
    interactive ? hoverColumnEl : null,
    0,
  );

  useEffect(() => {
    if (!isPhone) return;
    const scroller = scrollRef.current;
    const target = currentBarRef.current;
    if (!scroller || !target) return;
    const left =
      target.offsetLeft - scroller.clientWidth / 2 + target.offsetWidth / 2;
    scroller.scrollTo({ left: Math.max(0, left), behavior: "auto" });
  }, [isPhone, displayBars, selectedMonthKey]);

  function displaySplit(bar: MonthBurnBar) {
    const split = barSplit(bar, unit);
    if (!blendContractors) return split;
    return {
      used: split.used + split.contractorUsed,
      future: split.future + split.contractorFuture,
      contractorUsed: 0,
      contractorFuture: 0,
      contractor: 0,
      total: split.total,
    };
  }

  function formatValue(n: number): string {
    if (unit === "amount") return formatMoney(n);
    return formatHours(n);
  }

  function monthTooltipContent(bar: MonthBurnBar) {
    const split = displaySplit(bar);
    const total = split.total;
    const hasCap = cap > 0;
    const hasContractorInTotal = split.contractor > 0 && !blendContractors;
    return (
      <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 shadow-lg">
        <div className="text-xs font-semibold leading-snug text-[var(--text)]">
          {bar.label}
        </div>
        <div className="my-2 border-t border-[var(--border)]" />
        <div
          className={cn(
            "grid gap-x-5 gap-y-1",
            hasCap ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          <div className="min-w-0">
            <div className="text-[10px] leading-tight text-[var(--text-muted)]">
              {unit === "amount" ? "Spend this month" : "Hours this month"}
            </div>
            <div className="mt-0.5 text-sm tabular-nums text-[var(--text)]">
              {formatValue(total)}
            </div>
            {hasContractorInTotal ? (
              <div className="mt-1 text-[10px] text-[var(--text-muted)]">
                incl. {formatValue(split.contractor)} contractor
              </div>
            ) : null}
          </div>
          {hasCap ? (
            <div className="min-w-0">
              <div className="text-[10px] leading-tight text-[var(--text-muted)]">
                Monthly budget remaining
              </div>
              <div className="mt-0.5 text-sm tabular-nums text-[var(--text)]">
                {formatValue(Math.max(0, cap - total))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
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
        ref={scrollRef}
        className="overflow-x-auto overscroll-x-contain"
        onMouseLeave={interactive ? () => { setHoverKey(null); setHoverColumnEl(null); } : undefined}
      >
        <div className="relative" style={{ minWidth: chartMinWidth }}>
          {interactive && hoverBar ? (
            <ChartHoverTooltip anchor={tooltipAnchor}>
              {monthTooltipContent(hoverBar)}
            </ChartHoverTooltip>
          ) : null}
          <div style={{ minWidth: chartMinWidth }}>
          <div
            className={cn(
              "relative flex items-end gap-1.5 sm:gap-2",
              compact ? "mb-0.5 h-4" : "mb-1",
            )}
          >
            {displayBars.map((bar) => {
              const { total } = displaySplit(bar);
              return (
                <div
                  key={`v-${bar.key}`}
                  className="relative min-w-0 flex-1 text-center"
                >
                  <span
                    className={cn(
                      "block max-w-full truncate tabular-nums text-[var(--text-muted)]",
                      compact ? "text-[8px]" : "text-[9px] sm:text-[10px]",
                    )}
                    title={`${bar.label}: ${formatValue(total)}${
                      cap > 0 ? ` / ${formatValue(cap)}` : ""
                    }`}
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
                className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed"
                style={{
                  bottom: `${capPct}%`,
                  borderColor: CHART_BUDGET_STROKE,
                }}
                aria-hidden
              />
            ) : null}
            {showProfitLine ? (
              <div
                className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed"
                style={{
                  bottom: `${profitPct}%`,
                  borderColor: CHART_TARGET_STROKE,
                }}
                aria-hidden
              />
            ) : null}
            {displayBars.map((bar) => {
              const {
                used,
                future,
                contractorUsed,
                contractorFuture,
                contractor,
                total,
              } = displaySplit(bar);
              const currentMonth = bar.key === nowKey;
              return (
                <div
                  key={bar.key}
                  ref={bar.key === nowKey ? currentBarRef : undefined}
                  className="flex h-full min-w-0 flex-1"
                >
                  <MonthBarColumn
                    bar={bar}
                    unit={unit}
                    total={total}
                    used={used}
                    future={future}
                    contractorUsed={contractorUsed}
                    contractorFuture={contractorFuture}
                    contractor={contractor}
                    maxValue={maxValue}
                    cap={cap}
                    showCapLine={showCapLine}
                    compact={compact}
                    selected={selectedMonthKey === bar.key}
                    currentMonth={currentMonth}
                    interactive={interactive}
                    isHovered={interactive && hoverKey === bar.key}
                    onHoverStart={(el) => {
                      setHoverKey(bar.key);
                      setHoverColumnEl(el);
                    }}
                    onMonthSelect={interactive ? onMonthSelect : undefined}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex gap-1.5 sm:gap-2">
            {displayBars.map((bar) => (
              <div key={`l-${bar.key}`} className="min-w-0 flex-1 text-center">
                <span
                  className={cn(
                    "block truncate text-[var(--text-muted)]",
                    compact ? "text-[8px]" : "text-[8px] sm:text-[10px]",
                    isFutureMonth(bar.year, bar.monthIndex) && "italic",
                    selectedMonthKey === bar.key &&
                      "font-semibold text-[var(--text)]",
                  )}
                >
                  {multiYear
                    ? `${bar.label.split(" ")[0]} ${String(bar.year).slice(2)}`
                    : bar.label.split(" ")[0]}
                </span>
              </div>
            ))}
          </div>
          </div>
        </div>
      </div>
      {!compact ? (
        <BudgetChartLegend
          showContractor={hasContractor}
          showTargetCost={showProfitLine}
          showMonthlyBudget={showCapLine}
          monthlyBudgetLabel={showCapLine ? formatValue(cap) : undefined}
        />
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
