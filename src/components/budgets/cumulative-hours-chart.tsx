"use client";

import { cn } from "@/lib/cn";
import {
  formatHours,
  type CumulativeBurnPoint,
} from "@/lib/domain/budget";

/** Cumulative used (solid) vs planned (dashed) hours vs budget line. */
export function CumulativeHoursChart({
  points,
  budgetHours,
  className,
}: {
  points: CumulativeBurnPoint[];
  budgetHours: number | null;
  className?: string;
}) {
  if (points.length === 0) {
    return (
      <p className={cn("text-sm text-[var(--text-muted)]", className)}>
        No schedule dates to chart yet.
      </p>
    );
  }

  const w = 640;
  const h = 200;
  const padL = 40;
  const padR = 12;
  const padT = 16;
  const padB = 36;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const maxY = Math.max(
    budgetHours ?? 0,
    ...points.map((p) => Math.max(p.cumulativeUsed, p.cumulativePlanned)),
    1,
  );
  const over =
    budgetHours != null &&
    budgetHours > 0 &&
    points[points.length - 1]!.cumulativePlanned > budgetHours;

  function xAt(i: number) {
    if (points.length <= 1) return padL + plotW / 2;
    return padL + (i / (points.length - 1)) * plotW;
  }
  function yAt(v: number) {
    return padT + plotH - (v / maxY) * plotH;
  }

  function pathFor(
    values: number[],
    fromIndex = 0,
    toIndex = values.length - 1,
  ) {
    const parts: string[] = [];
    for (let i = fromIndex; i <= toIndex; i++) {
      const x = xAt(i);
      const y = yAt(values[i]!);
      parts.push(`${i === fromIndex ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return parts.join(" ");
  }

  const usedVals = points.map((p) => p.cumulativeUsed);
  const plannedVals = points.map((p) => p.cumulativePlanned);
  const firstFuture = points.findIndex((p) => p.isFuture);
  const usedEnd =
    firstFuture < 0 ? points.length - 1 : Math.max(0, firstFuture - 1);
  const plannedStart = usedEnd;

  const budgetY =
    budgetHours != null && budgetHours > 0 ? yAt(budgetHours) : null;

  // Month tick every point (already monthly)
  const tickStep = Math.max(1, Math.ceil(points.length / 8));

  return (
    <div className={cn(className)}>
      <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">
        Cumulative hours · solid used · dashed planned
        {over ? (
          <span className="ml-2 font-semibold text-[var(--status-over)]">
            Over budget
          </span>
        ) : null}
      </p>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-auto w-full"
        role="img"
        aria-label="Cumulative hours chart"
      >
        {budgetY != null ? (
          <line
            x1={padL}
            x2={w - padR}
            y1={budgetY}
            y2={budgetY}
            stroke="var(--status-over)"
            strokeOpacity={over ? 0.9 : 0.35}
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        ) : null}
        {usedEnd >= 0 ? (
          <path
            d={pathFor(usedVals, 0, usedEnd)}
            fill="none"
            stroke={over ? "var(--status-over)" : "var(--accent)"}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        {plannedStart < points.length - 1 ||
        (plannedStart === points.length - 1 && firstFuture >= 0) ? (
          <path
            d={pathFor(
              plannedVals,
              Math.max(0, plannedStart),
              points.length - 1,
            )}
            fill="none"
            stroke={over ? "var(--status-over)" : "var(--accent)"}
            strokeWidth={2.5}
            strokeDasharray="6 4"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.85}
          />
        ) : null}
        {points.map((p, i) =>
          i % tickStep === 0 || i === points.length - 1 ? (
            <text
              key={p.key}
              x={xAt(i)}
              y={h - 10}
              textAnchor="middle"
              className="fill-[var(--text-muted)]"
              style={{ fontSize: 10 }}
            >
              {p.label.split(" ")[0]}
            </text>
          ) : null,
        )}
        <text
          x={4}
          y={padT + 4}
          className="fill-[var(--text-muted)]"
          style={{ fontSize: 10 }}
        >
          {formatHours(maxY)}
        </text>
        <text
          x={4}
          y={padT + plotH}
          className="fill-[var(--text-muted)]"
          style={{ fontSize: 10 }}
        >
          0
        </text>
      </svg>
      {budgetHours != null && budgetHours > 0 ? (
        <p className="mt-1 text-[10px] text-[var(--text-muted)]">
          Budget {formatHours(budgetHours)}
          {over
            ? ` · trending ${formatHours(points[points.length - 1]!.cumulativePlanned)}`
            : ""}
        </p>
      ) : null}
    </div>
  );
}
