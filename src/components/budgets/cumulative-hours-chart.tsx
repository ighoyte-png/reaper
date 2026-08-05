"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { format, parseISO } from "date-fns";
import { ChartColumn, ChartLine } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  formatChartMoneyAxis,
  formatHours,
  formatMoney,
  type WeeklyProgressPoint,
} from "@/lib/domain/budget";

type ChartTab = "progress" | "weekly";

const contractorColor = "var(--status-healthy)";

function ChartLegend({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p className="mt-2 flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
      <span className="inline-flex items-center gap-1">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: contractorColor }}
          aria-hidden
        />
        Contractor
      </span>
      <span className="inline-flex items-center gap-1">
        <span
          className="inline-block h-2 w-2 rounded-full bg-[var(--accent)]"
          aria-hidden
        />
        Internal
      </span>
    </p>
  );
}

/** Project progress / hours-per-week charts matching budget detail layout. */
export function ProjectProgressCharts({
  points,
  budgetHours,
  budgetAmount,
  unit = "hours",
  contractorBaseline = 0,
  className,
}: {
  points: WeeklyProgressPoint[];
  budgetHours?: number | null;
  budgetAmount?: number | null;
  unit?: "hours" | "amount";
  /** Flat contractor commitment shown as a green baseline on the progress chart. */
  contractorBaseline?: number;
  className?: string;
}) {
  const [tab, setTab] = useState<ChartTab>("progress");
  const isAmount = unit === "amount";
  const budgetCap = isAmount ? budgetAmount : budgetHours;

  if (points.length === 0) {
    return (
      <p className={cn("text-sm text-[var(--text-muted)]", className)}>
        No schedule dates to chart yet.
      </p>
    );
  }

  return (
    <div className={cn(className)}>
      <div className="mb-3 flex flex-wrap gap-2">
        <ChartTabButton
          active={tab === "progress"}
          onClick={() => setTab("progress")}
          icon={<ChartLine size={14} strokeWidth={2} />}
          label="Project progress"
        />
        <ChartTabButton
          active={tab === "weekly"}
          onClick={() => setTab("weekly")}
          icon={<ChartColumn size={14} strokeWidth={2} />}
          label={isAmount ? "Spend per week" : "Hours per week"}
        />
      </div>
      {tab === "progress" ? (
        <>
          <ProgressLineChart
            points={points}
            unit={unit}
            budgetCap={budgetCap ?? null}
            contractorBaseline={contractorBaseline}
          />
          <ChartLegend show={contractorBaseline > 0} />
        </>
      ) : (
        <HoursPerWeekChart points={points} unit={unit} />
      )}
    </div>
  );
}

function ChartTabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
        active
          ? "border-[var(--text-muted)] bg-[var(--bg)] text-[var(--text)]"
          : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/** Whole-hour Y ticks stepping by 5s (or 1s for tiny ranges). */
function niceHourAxis(
  dataMax: number,
  preferredSteps = 4,
): { maxY: number; ticks: number[] } {
  const target = Math.max(1, dataMax);
  let step: number;
  if (target <= 5) {
    step = 1;
  } else {
    step = Math.max(5, Math.ceil(target / preferredSteps / 5) * 5);
  }
  const maxY = Math.ceil(target / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= maxY + 1e-9; v += step) {
    ticks.push(Math.round(v));
  }
  return { maxY, ticks };
}

function niceAmountAxis(
  dataMax: number,
  preferredSteps = 4,
): { maxY: number; ticks: number[] } {
  const target = Math.max(1, dataMax);
  const rough = target / preferredSteps;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / magnitude;
  let niceNorm = 1;
  if (norm > 5) niceNorm = 10;
  else if (norm > 2) niceNorm = 5;
  else if (norm > 1) niceNorm = 2;
  const step = niceNorm * magnitude;
  const maxY = Math.ceil(target / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= maxY + 1e-9; v += step) {
    ticks.push(Math.round(v));
  }
  return { maxY, ticks };
}

function pointValue(
  point: WeeklyProgressPoint,
  field: "used" | "planned",
  unit: "hours" | "amount",
): number {
  if (unit === "amount") {
    return field === "used"
      ? point.cumulativeUsedAmount
      : point.cumulativePlannedAmount;
  }
  return field === "used" ? point.cumulativeUsed : point.cumulativePlanned;
}

function weekValue(point: WeeklyProgressPoint, unit: "hours" | "amount"): number {
  return unit === "amount" ? point.weekAmount : point.weekHours;
}

function formatAxisValue(v: number, unit: "hours" | "amount"): string {
  return unit === "amount" ? formatChartMoneyAxis(v) : `${v}h`;
}

function formatDetailValue(v: number, unit: "hours" | "amount"): string {
  return unit === "amount" ? formatMoney(v) : formatHours(v);
}

function ProgressLineChart({
  points,
  unit,
  budgetCap,
  contractorBaseline = 0,
}: {
  points: WeeklyProgressPoint[];
  unit: "hours" | "amount";
  budgetCap: number | null;
  contractorBaseline?: number;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const hatchId = useId().replace(/:/g, "");
  const w = 720;
  const h = 174;
  const padL = unit === "amount" ? 52 : 44;
  const padR = 16;
  const padT = 22;
  const padB = 28;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const hasBudget = budgetCap != null && budgetCap > 0;
  const hasContractorBaseline = contractorBaseline > 0;
  const dataMax = Math.max(
    ...points.map((p) => {
      const internalUsed = pointValue(p, "used", unit);
      const internalPlanned = pointValue(p, "planned", unit);
      return Math.max(
        contractorBaseline + internalUsed,
        contractorBaseline + internalPlanned,
      );
    }),
    hasContractorBaseline ? contractorBaseline : 0,
    1,
  );
  const { maxY, ticks: yTicks } = useMemo(
    () =>
      unit === "amount"
        ? niceAmountAxis(
            Math.max(dataMax, hasBudget ? budgetCap! : 0) * 1.08,
          )
        : niceHourAxis(
            Math.max(dataMax, hasBudget ? budgetCap! : 0) * 1.08,
          ),
    [dataMax, hasBudget, budgetCap, unit],
  );

  const currentIdx = points.findIndex((p) => p.isCurrentWeek);
  const handoffIdx =
    currentIdx >= 0
      ? currentIdx
      : Math.max(
          0,
          points.findIndex((p) => p.isFuture) - 1,
        );

  function xAt(i: number) {
    if (points.length <= 1) return padL + plotW / 2;
    return padL + (i / (points.length - 1)) * plotW;
  }
  function yAt(v: number) {
    return padT + plotH - (v / maxY) * plotH;
  }

  /** Display Y: used through handoff, planned afterward; offset by contractor baseline. */
  function internalValueAt(i: number) {
    const p = points[i]!;
    if (i < handoffIdx) return pointValue(p, "used", unit);
    if (i === handoffIdx) return pointValue(p, "used", unit);
    return pointValue(p, "planned", unit);
  }

  function valueAt(i: number) {
    return contractorBaseline + internalValueAt(i);
  }

  function pathSegment(from: number, to: number) {
    if (to < from) return "";
    const parts: string[] = [];
    for (let i = from; i <= to; i++) {
      parts.push(
        `${i === from ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(valueAt(i)).toFixed(1)}`,
      );
    }
    return parts.join(" ");
  }

  const monthLabels = useMemo(() => {
    const groups: { key: string; label: string; start: number; end: number }[] =
      [];
    points.forEach((p, i) => {
      const key = p.weekStartKey.slice(0, 7);
      const last = groups[groups.length - 1];
      if (last && last.key === key) {
        last.end = i;
      } else {
        const d = new Date(`${p.weekStartKey}T12:00:00`);
        groups.push({
          key,
          label: d.toLocaleString("en-US", {
            month: "short",
            year: "numeric",
          }),
          start: i,
          end: i,
        });
      }
    });
    return groups;
  }, [points]);

  const budgetY = hasBudget ? yAt(budgetCap!) : null;
  const contractorY = hasContractorBaseline ? yAt(contractorBaseline) : null;
  const firstX = xAt(0);
  const lastX = xAt(points.length - 1);
  const weekBandW =
    points.length <= 1 ? plotW * 0.08 : plotW / (points.length - 1);
  const thisWeekX =
    handoffIdx >= 0 && points[handoffIdx]?.isCurrentWeek
      ? xAt(handoffIdx)
      : null;

  const lineColor = "var(--accent)";
  const mutedLine = "var(--accent)";
  const hover = hoverIdx != null ? points[hoverIdx] : null;
  const hoverVal = hoverIdx != null ? valueAt(hoverIdx) : 0;
  const hoverX = hoverIdx != null ? xAt(hoverIdx) : null;

  return (
    <div className="relative overflow-visible">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-auto w-full overflow-hidden"
        role="img"
        aria-label="Project progress chart"
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <pattern
            id={`week-hover-hatch-${hatchId}`}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-45)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="6"
              stroke="var(--accent)"
              strokeWidth="2"
              strokeOpacity="0.32"
            />
          </pattern>
        </defs>

        {yTicks.map((v, i) => {
          const y = yAt(v);
          return (
            <g key={`y-${i}`}>
              <line
                x1={padL}
                x2={w - padR}
                y1={y}
                y2={y}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <text
                x={padL - 8}
                y={y + 3}
                textAnchor="end"
                className="fill-[var(--text-muted)]"
                style={{ fontSize: 7 }}
              >
                {formatAxisValue(v, unit)}
              </text>
            </g>
          );
        })}

        {monthLabels.map((m) => {
          const x0 = xAt(m.start);
          const x1 = xAt(m.end);
          const mid = (x0 + x1) / 2;
          return (
            <g key={m.key}>
              {m.start > 0 ? (
                <line
                  x1={x0}
                  x2={x0}
                  y1={padT}
                  y2={padT + plotH}
                  stroke="var(--border)"
                  strokeWidth={1}
                />
              ) : null}
              <text
                x={mid}
                y={h - 8}
                textAnchor="middle"
                className="fill-[var(--text-muted)]"
                style={{ fontSize: 7 }}
              >
                {m.label}
              </text>
            </g>
          );
        })}

        {thisWeekX != null ? (
          <g>
            <rect
              x={thisWeekX - weekBandW / 2}
              y={padT}
              width={weekBandW}
              height={plotH}
              fill="var(--accent)"
              fillOpacity={0.1}
            />
            <line
              x1={thisWeekX - weekBandW / 2}
              x2={thisWeekX + weekBandW / 2}
              y1={padT}
              y2={padT}
              stroke="var(--accent)"
              strokeWidth={1.25}
            />
            <text
              x={thisWeekX}
              y={padT - 6}
              textAnchor="middle"
              fill="var(--accent)"
              style={{ fontSize: 8, fontWeight: 600 }}
            >
              This week
            </text>
          </g>
        ) : null}

        {hoverX != null ? (
          <g pointerEvents="none">
            <rect
              x={hoverX - weekBandW / 2}
              y={padT}
              width={weekBandW}
              height={plotH}
              fill={`url(#week-hover-hatch-${hatchId})`}
            />
            <rect
              x={hoverX - weekBandW / 2}
              y={padT}
              width={weekBandW}
              height={plotH}
              fill="var(--accent)"
              fillOpacity={0.06}
            />
            <line
              x1={hoverX - weekBandW / 2}
              x2={hoverX + weekBandW / 2}
              y1={padT}
              y2={padT}
              stroke="var(--accent)"
              strokeWidth={1.25}
            />
          </g>
        ) : null}

        {contractorY != null ? (
          <g>
            <line
              x1={firstX}
              x2={lastX}
              y1={contractorY}
              y2={contractorY}
              stroke={contractorColor}
              strokeWidth={1.25}
              strokeLinecap="round"
            />
            <circle
              cx={firstX}
              cy={contractorY}
              r={2}
              fill={contractorColor}
            />
            <circle
              cx={lastX}
              cy={contractorY}
              r={2}
              fill={contractorColor}
            />
          </g>
        ) : null}

        {budgetY != null ? (
          <line
            x1={padL}
            x2={w - padR}
            y1={budgetY}
            y2={budgetY}
            stroke="#ef4444"
            strokeWidth={1.25}
            strokeDasharray="4 3"
            strokeLinecap="round"
          />
        ) : null}

        {handoffIdx < points.length - 1 ? (
          <path
            d={pathSegment(handoffIdx, points.length - 1)}
            fill="none"
            stroke={mutedLine}
            strokeWidth={1.25}
            strokeDasharray="5 4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {handoffIdx >= 0 ? (
          <path
            d={pathSegment(0, handoffIdx)}
            fill="none"
            stroke={lineColor}
            strokeWidth={1.25}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {points.map((p, i) => {
          const future = i > handoffIdx;
          const cx = xAt(i);
          const cy = yAt(valueAt(i));
          return (
            <g key={p.key}>
              <rect
                x={cx - weekBandW / 2}
                y={padT}
                width={weekBandW}
                height={plotH}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHoverIdx(i)}
              />
              <circle
                cx={cx}
                cy={cy}
                r={hoverIdx === i ? 3.5 : 2}
                fill={future ? mutedLine : lineColor}
                className="pointer-events-none"
              />
            </g>
          );
        })}
      </svg>

      {hover && hoverIdx != null ? (
        <div
          className="pointer-events-none absolute z-10 w-max max-w-[min(100%,18rem)] -translate-x-1/2 -translate-y-full"
          style={{
            left: `${(xAt(hoverIdx) / w) * 100}%`,
            top: `${(yAt(hoverVal) / h) * 100}%`,
            marginTop: -10,
          }}
        >
          <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 shadow-lg">
            <div className="text-xs font-semibold leading-snug text-[var(--text)]">
              Cumulative up to{" "}
              {format(parseISO(hover.weekEndKey), "dd MMM yyyy")} (Week{" "}
              {hoverIdx + 1})
            </div>
            <div className="my-2 border-t border-[var(--border)]" />
            <div
              className={cn(
                "grid gap-x-5 gap-y-1",
                hasBudget ? "grid-cols-2" : "grid-cols-1",
              )}
            >
              <div className="min-w-0">
                <div className="text-[10px] leading-tight text-[var(--text-muted)]">
                  {hoverIdx > handoffIdx
                    ? unit === "amount"
                      ? "Forecasted spend"
                      : "Forecasted hours"
                    : unit === "amount"
                      ? "Cumulative spend"
                      : "Cumulative hours"}
                </div>
                <div className="mt-0.5 text-sm tabular-nums text-[var(--text)]">
                  {formatDetailValue(hoverVal, unit)}
                </div>
                {hasContractorBaseline ? (
                  <div className="mt-1 text-[10px] text-[var(--text-muted)]">
                    incl. {formatDetailValue(contractorBaseline, unit)} contractor
                  </div>
                ) : null}
              </div>
              {hasBudget ? (
                <div className="min-w-0">
                  <div className="text-[10px] leading-tight text-[var(--text-muted)]">
                    Forecasted budget remaining
                  </div>
                  <div className="mt-0.5 text-sm tabular-nums text-[var(--text)]">
                    {formatDetailValue(Math.max(0, budgetCap! - hoverVal), unit)}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div
            className="mx-auto h-0 w-0 border-x-[6px] border-t-[6px] border-x-transparent border-t-[var(--border)]"
            aria-hidden
          />
          <div
            className="-mt-[7px] mx-auto h-0 w-0 border-x-[5px] border-t-[5px] border-x-transparent border-t-[var(--bg-elevated)]"
            aria-hidden
          />
        </div>
      ) : null}
    </div>
  );
}

export function HoursPerWeekChart({
  points,
  unit = "hours",
}: {
  points: WeeklyProgressPoint[];
  unit?: "hours" | "amount";
}) {
  const values = points.map((p) => weekValue(p, unit));
  const maxV = Math.max(...values, 1);
  const { maxY, ticks: yTicks } = useMemo(
    () =>
      unit === "amount"
        ? niceAmountAxis(maxV * 1.08)
        : niceHourAxis(maxV * 1.08),
    [maxV, unit],
  );
  const monthLabels = useMemo(() => {
    const seen = new Map<string, number>();
    points.forEach((p, i) => {
      const key = p.weekStartKey.slice(0, 7);
      if (!seen.has(key)) seen.set(key, i);
    });
    return [...seen.entries()].map(([key, index]) => {
      const d = new Date(`${points[index]!.weekStartKey}T12:00:00`);
      return {
        key,
        index,
        label: d.toLocaleString("en-US", { month: "short", year: "numeric" }),
      };
    });
  }, [points]);

  return (
    <div className="flex gap-2 pt-1">
      <div className="relative h-44 w-10 shrink-0">
        {[...yTicks].reverse().map((v, i) => (
          <span
            key={`y-${i}`}
            className="absolute right-0 -translate-y-1/2 text-[7px] tabular-nums text-[var(--text-muted)]"
            style={{ top: `${(1 - v / maxY) * 100}%` }}
          >
            {formatAxisValue(v, unit)}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
      <div className="flex h-44 items-end gap-px sm:gap-0.5">
        {points.map((p) => {
          const v = weekValue(p, unit);
          const pct = Math.max(v > 0 ? 4 : 0, (v / maxY) * 100);
          return (
            <div
              key={p.key}
              className="relative flex min-w-0 flex-1 flex-col items-center justify-end"
              style={{ height: "100%" }}
              title={`${p.label}: ${formatDetailValue(v, unit)}`}
            >
              {p.isCurrentWeek ? (
                <div
                  className="absolute inset-x-0 bottom-0 top-0 bg-[var(--accent)]/10"
                  aria-hidden
                />
              ) : null}
              <div
                className={cn(
                  "relative z-[1] w-full max-w-[18px] rounded-t-sm",
                  p.isCurrentWeek
                    ? "bg-[var(--accent)]"
                    : p.isFuture
                      ? "bg-[var(--text-muted)]/35"
                      : "bg-[var(--text-muted)]/70",
                )}
                style={{ height: `${pct}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="relative mt-2 h-4">
        {monthLabels.map((m) => (
          <span
            key={m.key}
            className="absolute top-0 -translate-x-1/2 text-[7px] text-[var(--text-muted)]"
            style={{
              left: `${((m.index + 0.5) / points.length) * 100}%`,
            }}
          >
            {m.label}
          </span>
        ))}
      </div>
      </div>
    </div>
  );
}

/** @deprecated Prefer ProjectProgressCharts */
export function CumulativeHoursChart({
  points,
  budgetHours,
  className,
}: {
  points: { cumulativeUsed: number; cumulativePlanned: number; isFuture: boolean; key: string; label: string }[];
  budgetHours: number | null;
  className?: string;
}) {
  // Adapt monthly points into weekly-shaped stubs for legacy callers.
  const adapted: WeeklyProgressPoint[] = points.map((p, i) => ({
    key: p.key,
    weekStartKey: `${p.key}-01`,
    weekEndKey: `${p.key}-28`,
    label: p.label,
    weekHours: 0,
    weekAmount: 0,
    cumulativeUsed: p.cumulativeUsed,
    cumulativePlanned: p.cumulativePlanned,
    cumulativeUsedAmount: 0,
    cumulativePlannedAmount: 0,
    isCurrentWeek: !p.isFuture && (points[i + 1]?.isFuture ?? true),
    isFuture: p.isFuture,
  }));
  return (
    <ProjectProgressCharts
      points={adapted}
      budgetHours={budgetHours}
      className={className}
    />
  );
}
