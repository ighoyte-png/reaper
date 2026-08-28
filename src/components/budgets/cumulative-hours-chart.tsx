"use client";

import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { format, parseISO } from "date-fns";
import { ChartColumn, ChartLine } from "lucide-react";
import {
  ChartHoverPattern,
  ChartHoverTooltip,
  ChartWeekHoverBand,
  progressWeekBandBounds,
  slotWeekBandBounds,
  useSvgChartAnchor,
} from "@/components/budgets/chart-hover";
import { cn } from "@/lib/cn";
import {
  formatChartMoneyAxis,
  formatHours,
  formatMoney,
  type WeeklyProgressPoint,
} from "@/lib/domain/budget";
import { progressLineHandoffIndex } from "@/components/budgets/progress-line-handoff";

type ChartTab = "progress" | "weekly";

const CHART_MIN_WIDTH_PX = 560;

const contractorColor = "var(--status-healthy)";

function ChartLegend({
  showContractor,
  showProfit,
}: {
  showContractor: boolean;
  showProfit: boolean;
}) {
  if (!showContractor && !showProfit) return null;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-[var(--text-muted)]">
      {showContractor ? (
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: contractorColor }}
            aria-hidden
          />
          Contractor
        </span>
      ) : null}
      <span className="inline-flex items-center gap-1">
        <span
          className="inline-block h-2 w-2 rounded-full bg-[var(--accent)]"
          aria-hidden
        />
        Internal
      </span>
      {showProfit ? (
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-0 w-3 border-t border-dashed border-[var(--status-near)]"
            aria-hidden
          />
          Target cost
        </span>
      ) : null}
    </p>
  );
}

export const OUTSIDE_DATES_CHART_NOTE =
  "*Time has been booked on the schedule that is outside the start and end dates of this project and is not reflected in this chart.";

export function OutsideDatesChartNote({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "min-w-0 text-[10px] leading-snug text-[var(--status-near)]",
        className,
      )}
    >
      {OUTSIDE_DATES_CHART_NOTE}
    </p>
  );
}

export function ProjectProgressCharts({
  points,
  budgetHours,
  budgetAmount,
  unit = "hours",
  contractorBaseline = 0,
  profitLine = null,
  outsideDatesNote = false,
  className,
}: {
  points: WeeklyProgressPoint[];
  budgetHours?: number | null;
  budgetAmount?: number | null;
  unit?: "hours" | "amount";
  /** Flat contractor commitment shown as a green baseline on the progress chart. */
  contractorBaseline?: number;
  /** Fixed-fee target-cost line (e.g. 75% of fee). */
  profitLine?: number | null;
  /** Confirmed schedule hours sit outside project start/end. */
  outsideDatesNote?: boolean;
  className?: string;
}) {
  const [tab, setTab] = useState<ChartTab>("progress");
  const isAmount = unit === "amount";
  const budgetCap = isAmount ? budgetAmount : budgetHours;

  if (points.length === 0) {
    return (
      <div className={cn(className)}>
        {outsideDatesNote ? (
          <div className="mb-3">
            <OutsideDatesChartNote />
          </div>
        ) : null}
        <p className="text-sm text-[var(--text-muted)]">
          No schedule dates to chart yet.
        </p>
      </div>
    );
  }

  return (
    <div className={cn(className)}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ChartTabButton
          active={tab === "progress"}
          onClick={() => setTab("progress")}
          icon={<ChartLine size={14} strokeWidth={2} />}
          label="Project Progress"
        />
        <ChartTabButton
          active={tab === "weekly"}
          onClick={() => setTab("weekly")}
          icon={<ChartColumn size={14} strokeWidth={2} />}
          label={isAmount ? "Spend Per Week" : "Hours Per Week"}
        />
        {outsideDatesNote ? (
          <OutsideDatesChartNote className="flex-1 text-right sm:ml-auto" />
        ) : null}
      </div>
      {tab === "progress" ? (
        <>
          <ProgressLineChart
            points={points}
            unit={unit}
            budgetCap={budgetCap ?? null}
            contractorBaseline={contractorBaseline}
            profitLine={profitLine}
          />
          <ChartLegend
            showContractor={contractorBaseline > 0}
            showProfit={Boolean(profitLine && profitLine > 0)}
          />
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
  profitLine = null,
}: {
  points: WeeklyProgressPoint[];
  unit: "hours" | "amount";
  budgetCap: number | null;
  contractorBaseline?: number;
  profitLine?: number | null;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
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
  const hasProfit = profitLine != null && profitLine > 0;
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
  const { maxY, ticks: yTicks } = useMemo(() => {
    const cap = hasBudget ? budgetCap! : 0;
    const profit = hasProfit ? profitLine! : 0;
    const scalePeak = Math.max(dataMax, cap, profit);
    const padded =
      hasBudget && dataMax >= cap ? dataMax * 1.04 : scalePeak * 1.04;
    return unit === "amount" ? niceAmountAxis(padded) : niceHourAxis(padded);
  }, [dataMax, hasBudget, budgetCap, hasProfit, profitLine, unit]);

  const handoffIdx = progressLineHandoffIndex(points);

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

  type StrokeBand = "ok" | "near" | "over";
  const lineColor = "var(--accent)";
  const nearStroke = "var(--status-near)";
  const overStroke = "var(--status-over)";

  function bandAt(v: number): StrokeBand {
    if (hasBudget && budgetCap != null && v > budgetCap) return "over";
    if (hasProfit && profitLine != null && v > profitLine) return "near";
    return "ok";
  }

  function strokeFor(band: StrokeBand): string {
    if (band === "over") return overStroke;
    if (band === "near") return nearStroke;
    return lineColor;
  }

  function pathPiecesAtCap(
    from: number,
    to: number,
  ): { d: string; band: StrokeBand }[] {
    if (to < from) return [];
    if (from === to) {
      return [
        {
          d: `M ${xAt(from).toFixed(1)} ${yAt(valueAt(from)).toFixed(1)}`,
          band: bandAt(valueAt(from)),
        },
      ];
    }

    const thresholds: { v: number }[] = [];
    if (hasProfit && profitLine != null) thresholds.push({ v: profitLine });
    if (hasBudget && budgetCap != null) thresholds.push({ v: budgetCap });

    const pieces: { d: string; band: StrokeBand }[] = [];
    let currentBand = bandAt(valueAt(from));
    let parts: string[] = [
      `M ${xAt(from).toFixed(1)} ${yAt(valueAt(from)).toFixed(1)}`,
    ];

    const flush = () => {
      if (parts.length > 0) {
        pieces.push({ d: parts.join(" "), band: currentBand });
        parts = [];
      }
    };

    for (let i = from; i < to; i++) {
      const v0 = valueAt(i);
      const v1 = valueAt(i + 1);
      const x0 = xAt(i);
      const x1 = xAt(i + 1);
      const hits = thresholds
        .map((th) => {
          const straddles =
            (v0 <= th.v && v1 > th.v) || (v0 > th.v && v1 <= th.v);
          if (!straddles) return null;
          const denom = v1 - v0;
          const t = Math.abs(denom) < 1e-9 ? 0 : (th.v - v0) / denom;
          return { t: Math.min(1, Math.max(0, t)), v: th.v };
        })
        .filter((h): h is { t: number; v: number } => h != null)
        .sort((a, b) => a.t - b.t);

      if (hits.length === 0) {
        if (parts.length === 0) {
          parts.push(`M ${x0.toFixed(1)} ${yAt(v0).toFixed(1)}`);
          currentBand = bandAt(v0);
        }
        parts.push(`L ${x1.toFixed(1)} ${yAt(v1).toFixed(1)}`);
        continue;
      }

      let lastV = v0;
      if (parts.length === 0) {
        parts.push(`M ${x0.toFixed(1)} ${yAt(v0).toFixed(1)}`);
        currentBand = bandAt(v0);
      }
      for (const hit of hits) {
        const xc = x0 + hit.t * (x1 - x0);
        const yc = yAt(hit.v);
        parts.push(`L ${xc.toFixed(1)} ${yc.toFixed(1)}`);
        flush();
        currentBand = bandAt(lastV + (v1 - v0) * hit.t + (v1 >= v0 ? 1e-6 : -1e-6));
        parts.push(`M ${xc.toFixed(1)} ${yc.toFixed(1)}`);
        lastV = hit.v;
      }
      parts.push(`L ${x1.toFixed(1)} ${yAt(v1).toFixed(1)}`);
    }

    flush();
    return pieces;
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
  const profitY = hasProfit ? yAt(profitLine!) : null;
  const contractorY = hasContractorBaseline ? yAt(contractorBaseline) : null;
  const firstX = xAt(0);
  const lastX = xAt(points.length - 1);
  const thisWeekIdx =
    handoffIdx >= 0 && points[handoffIdx]?.isCurrentWeek ? handoffIdx : null;
  const thisWeekBand =
    thisWeekIdx != null
      ? progressWeekBandBounds(thisWeekIdx, points.length, padL, plotW)
      : null;

  const usedPieces =
    handoffIdx >= 0 ? pathPiecesAtCap(0, handoffIdx) : [];
  const futurePieces =
    handoffIdx < points.length - 1
      ? pathPiecesAtCap(handoffIdx, points.length - 1)
      : [];
  const hover = hoverIdx != null ? points[hoverIdx] : null;
  const hoverVal = hoverIdx != null ? valueAt(hoverIdx) : 0;
  const hoverBand =
    hoverIdx != null
      ? progressWeekBandBounds(hoverIdx, points.length, padL, plotW)
      : null;

  const tooltipAnchor = useSvgChartAnchor(
    svgRef,
    hoverBand?.centerX ?? null,
    padT,
    w,
    h,
  );

  return (
    <div className="overflow-x-auto overscroll-x-contain">
      <div
        className="relative"
        style={{ minWidth: CHART_MIN_WIDTH_PX }}
        onMouseLeave={() => setHoverIdx(null)}
      >
      {hover && hoverIdx != null ? (
      <ChartHoverTooltip anchor={tooltipAnchor}>
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
      </ChartHoverTooltip>
      ) : null}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        className="h-auto w-full overflow-hidden"
        role="img"
        aria-label="Project progress chart"
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <ChartHoverPattern id={`week-hover-hatch-${hatchId}`} />
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

        {thisWeekBand ? (
          <g>
            <rect
              x={thisWeekBand.x}
              y={padT}
              width={thisWeekBand.width}
              height={plotH}
              fill="var(--accent)"
              fillOpacity={0.1}
            />
            <line
              x1={thisWeekBand.x}
              x2={thisWeekBand.x + thisWeekBand.width}
              y1={padT}
              y2={padT}
              stroke="var(--accent)"
              strokeWidth={1.25}
            />
            <text
              x={thisWeekBand.centerX}
              y={padT - 6}
              textAnchor="middle"
              fill="var(--accent)"
              style={{ fontSize: 8, fontWeight: 600 }}
            >
              This week
            </text>
          </g>
        ) : null}

        {hoverBand ? (
          <ChartWeekHoverBand
            patternId={`week-hover-hatch-${hatchId}`}
            x={hoverBand.x}
            width={hoverBand.width}
            padT={padT}
            plotH={plotH}
          />
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

        {profitY != null ? (
          <line
            x1={padL}
            x2={w - padR}
            y1={profitY}
            y2={profitY}
            stroke="var(--status-near)"
            strokeWidth={1.25}
            strokeDasharray="4 3"
            strokeLinecap="round"
          />
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

        {futurePieces.map((piece, i) => (
          <path
            key={`future-${i}`}
            d={piece.d}
            fill="none"
            stroke={strokeFor(piece.band)}
            strokeWidth={1.25}
            strokeDasharray="5 4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {usedPieces.map((piece, i) => (
          <path
            key={`used-${i}`}
            d={piece.d}
            fill="none"
            stroke={strokeFor(piece.band)}
            strokeWidth={1.25}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {points.map((p, i) => {
          const cx = xAt(i);
          const cy = yAt(valueAt(i));
          const band = bandAt(valueAt(i));
          const weekBand = progressWeekBandBounds(i, points.length, padL, plotW);
          return (
            <g key={p.key}>
              <rect
                x={weekBand.x}
                y={padT}
                width={weekBand.width}
                height={plotH}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHoverIdx(i)}
              />
              <circle
                cx={cx}
                cy={cy}
                r={hoverIdx === i ? 3.5 : 2}
                fill={strokeFor(band)}
                className="pointer-events-none"
              />
            </g>
          );
        })}
      </svg>
      </div>
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
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const hatchId = useId().replace(/:/g, "");
  const values = points.map((p) => weekValue(p, unit));
  const maxV = Math.max(...values, 1);
  const w = 720;
  const h = 174;
  const padL = unit === "amount" ? 52 : 44;
  const padR = 16;
  const padT = 22;
  const padB = 28;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const { maxY, ticks: yTicks } = useMemo(
    () =>
      unit === "amount"
        ? niceAmountAxis(maxV * 1.04)
        : niceHourAxis(maxV * 1.04),
    [maxV, unit],
  );
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

  const slotW = points.length <= 0 ? plotW : plotW / points.length;
  const barW = Math.max(2, Math.min(18, slotW * 0.62));
  const currentIdx = points.findIndex((p) => p.isCurrentWeek);

  function xCenter(i: number) {
    return padL + slotW * i + slotW / 2;
  }
  function yAt(v: number) {
    return padT + plotH - (v / maxY) * plotH;
  }

  const hover = hoverIdx != null ? points[hoverIdx] : null;
  const hoverVal = hoverIdx != null ? values[hoverIdx]! : 0;
  const hoverBand =
    hoverIdx != null
      ? slotWeekBandBounds(hoverIdx, points.length, padL, plotW)
      : null;
  const thisWeekIdx = currentIdx >= 0 ? currentIdx : null;
  const thisWeekBand =
    thisWeekIdx != null
      ? slotWeekBandBounds(thisWeekIdx, points.length, padL, plotW)
      : null;
  const tooltipAnchor = useSvgChartAnchor(
    svgRef,
    hoverBand?.centerX ?? null,
    padT,
    w,
    h,
  );

  return (
    <div className="overflow-x-auto overscroll-x-contain">
      <div
        className="relative"
        style={{ minWidth: CHART_MIN_WIDTH_PX }}
        onMouseLeave={() => setHoverIdx(null)}
      >
      {hover && hoverIdx != null ? (
      <ChartHoverTooltip anchor={tooltipAnchor}>
          <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 shadow-lg">
            <div className="text-xs font-semibold leading-snug text-[var(--text)]">
              {hover.label}
            </div>
            <div className="my-2 border-t border-[var(--border)]" />
            <div className="text-[10px] leading-tight text-[var(--text-muted)]">
              {unit === "amount" ? "Spend this week" : "Hours this week"}
            </div>
            <div className="mt-0.5 text-sm tabular-nums text-[var(--text)]">
              {formatDetailValue(hoverVal, unit)}
            </div>
          </div>
      </ChartHoverTooltip>
      ) : null}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        className="block h-auto w-full overflow-hidden"
        role="img"
        aria-label={unit === "amount" ? "Spend per week" : "Hours per week"}
      >
        <defs>
          <ChartHoverPattern id={`week-hover-hatch-${hatchId}`} />
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
          const x0 = padL + slotW * m.start;
          const x1 = padL + slotW * (m.end + 1);
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
        {thisWeekBand ? (
          <g>
            <rect
              x={thisWeekBand.x}
              y={padT}
              width={thisWeekBand.width}
              height={plotH}
              fill="var(--accent)"
              fillOpacity={0.1}
            />
            <line
              x1={thisWeekBand.x}
              x2={thisWeekBand.x + thisWeekBand.width}
              y1={padT}
              y2={padT}
              stroke="var(--accent)"
              strokeWidth={1.25}
            />
            <text
              x={thisWeekBand.centerX}
              y={padT - 6}
              textAnchor="middle"
              fill="var(--accent)"
              style={{ fontSize: 8, fontWeight: 600 }}
            >
              This week
            </text>
          </g>
        ) : null}
        {hoverBand ? (
          <ChartWeekHoverBand
            patternId={`week-hover-hatch-${hatchId}`}
            x={hoverBand.x}
            width={hoverBand.width}
            padT={padT}
            plotH={plotH}
          />
        ) : null}
        {points.map((p, i) => {
          const v = values[i]!;
          const barH = maxY <= 0 ? 0 : (v / maxY) * plotH;
          const x = xCenter(i) - barW / 2;
          const y = padT + plotH - barH;
          const fill = p.isCurrentWeek
            ? "var(--accent)"
            : p.isFuture
              ? "color-mix(in srgb, var(--text-muted) 35%, transparent)"
              : "color-mix(in srgb, var(--text-muted) 70%, transparent)";
          return (
            <g key={p.key}>
              <rect
                x={padL + slotW * i}
                y={padT}
                width={slotW}
                height={plotH}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHoverIdx(i)}
              />
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(v > 0 ? 2 : 0, barH)}
                rx={2}
                fill={fill}
                className="pointer-events-none"
              />
            </g>
          );
        })}
      </svg>
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
