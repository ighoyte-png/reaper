"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChartColumn, ChartLine } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  formatHours,
  type WeeklyProgressPoint,
} from "@/lib/domain/budget";

type ChartTab = "progress" | "weekly";

/** Project progress / hours-per-week charts matching budget detail layout. */
export function ProjectProgressCharts({
  points,
  budgetHours,
  className,
}: {
  points: WeeklyProgressPoint[];
  budgetHours: number | null;
  className?: string;
}) {
  const [tab, setTab] = useState<ChartTab>("progress");

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
          label="Hours per week"
        />
      </div>
      {tab === "progress" ? (
        <ProgressLineChart points={points} budgetHours={budgetHours} />
      ) : (
        <HoursPerWeekChart points={points} />
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

function ProgressLineChart({
  points,
  budgetHours,
}: {
  points: WeeklyProgressPoint[];
  budgetHours: number | null;
}) {
  const w = 720;
  const h = 260;
  const padL = 44;
  const padR = 16;
  const padT = 28;
  const padB = 32;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const hasBudget = budgetHours != null && budgetHours > 0;
  const dataMax = Math.max(
    ...points.map((p) =>
      Math.max(p.cumulativeUsed, p.cumulativePlanned),
    ),
    1,
  );
  const maxY = Math.max(dataMax, hasBudget ? budgetHours : 0) * 1.08;

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

  /** Display Y: used through handoff, planned afterward. */
  function valueAt(i: number) {
    const p = points[i]!;
    if (i < handoffIdx) return p.cumulativeUsed;
    if (i === handoffIdx) return p.cumulativeUsed;
    return p.cumulativePlanned;
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

  const yTicks = useMemo(() => {
    const steps = 5;
    return Array.from({ length: steps + 1 }, (_, i) => (maxY * i) / steps);
  }, [maxY]);

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

  const budgetY = hasBudget ? yAt(budgetHours) : null;
  const weekBandW =
    points.length <= 1 ? plotW * 0.08 : plotW / (points.length - 1);
  const thisWeekX =
    handoffIdx >= 0 && points[handoffIdx]?.isCurrentWeek
      ? xAt(handoffIdx)
      : null;

  const lineColor = "#4b5563";
  const mutedLine = "#9ca3af";

  return (
    <div className="overflow-hidden">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-auto w-full"
        role="img"
        aria-label="Project progress chart"
      >
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
                {formatHours(v)}
              </text>
            </g>
          );
        })}

        {/* Month separators + labels */}
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
                y={h - 10}
                textAnchor="middle"
                className="fill-[var(--text-muted)]"
                style={{ fontSize: 7 }}
              >
                {m.label}
              </text>
            </g>
          );
        })}

        {/* This week band */}
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
              strokeWidth={2}
            />
            <text
              x={thisWeekX}
              y={padT - 8}
              textAnchor="middle"
              fill="var(--accent)"
              style={{ fontSize: 8, fontWeight: 600 }}
            >
              This week
            </text>
          </g>
        ) : null}

        {/* Budget ceiling */}
        {budgetY != null ? (
          <line
            x1={padL}
            x2={w - padR}
            y1={budgetY}
            y2={budgetY}
            stroke="#ef4444"
            strokeWidth={1.75}
            strokeLinecap="round"
          />
        ) : null}

        {/* Planned (dashed) from handoff → end */}
        {handoffIdx < points.length - 1 ? (
          <path
            d={pathSegment(handoffIdx, points.length - 1)}
            fill="none"
            stroke={mutedLine}
            strokeWidth={2}
            strokeDasharray="5 4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {/* Used (solid) 0 → handoff */}
        {handoffIdx >= 0 ? (
          <path
            d={pathSegment(0, handoffIdx)}
            fill="none"
            stroke={lineColor}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {/* Point markers */}
        {points.map((p, i) => {
          const future = i > handoffIdx;
          return (
            <circle
              key={p.key}
              cx={xAt(i)}
              cy={yAt(valueAt(i))}
              r={2.75}
              fill={future ? mutedLine : lineColor}
            />
          );
        })}
      </svg>
    </div>
  );
}

function HoursPerWeekChart({ points }: { points: WeeklyProgressPoint[] }) {
  const maxH = Math.max(...points.map((p) => p.weekHours), 1);
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
    <div className="pt-1">
      <div className="flex h-44 items-end gap-px sm:gap-0.5">
        {points.map((p) => {
          const pct = Math.max(
            p.weekHours > 0 ? 4 : 0,
            (p.weekHours / maxH) * 100,
          );
          return (
            <div
              key={p.key}
              className="relative flex min-w-0 flex-1 flex-col items-center justify-end"
              style={{ height: "100%" }}
              title={`${p.label}: ${formatHours(p.weekHours)}`}
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
    cumulativeUsed: p.cumulativeUsed,
    cumulativePlanned: p.cumulativePlanned,
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
