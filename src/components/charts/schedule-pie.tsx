"use client";

import { cn } from "@/lib/cn";
import { formatHours } from "@/lib/domain/budget";

export type SchedulePieSlice = {
  projectId: string;
  hours: number;
  color: string;
  label: string;
};

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/** Donut segment path (angles in degrees, clockwise from 12 o'clock). */
function donutSlicePath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngle: number,
  endAngle: number,
) {
  const sweep = endAngle - startAngle;
  if (sweep <= 0.01) return "";
  // Full ring — two semicircles (SVG can't arc a full 360 in one go).
  if (sweep >= 359.99) {
    const top = polar(cx, cy, rOuter, 0);
    const bottom = polar(cx, cy, rOuter, 180);
    const topIn = polar(cx, cy, rInner, 0);
    const bottomIn = polar(cx, cy, rInner, 180);
    return [
      `M ${top.x} ${top.y}`,
      `A ${rOuter} ${rOuter} 0 1 1 ${bottom.x} ${bottom.y}`,
      `A ${rOuter} ${rOuter} 0 1 1 ${top.x} ${top.y}`,
      `M ${topIn.x} ${topIn.y}`,
      `A ${rInner} ${rInner} 0 1 0 ${bottomIn.x} ${bottomIn.y}`,
      `A ${rInner} ${rInner} 0 1 0 ${topIn.x} ${topIn.y}`,
      "Z",
    ].join(" ");
  }
  const large = sweep > 180 ? 1 : 0;
  const o0 = polar(cx, cy, rOuter, startAngle);
  const o1 = polar(cx, cy, rOuter, endAngle);
  const i1 = polar(cx, cy, rInner, endAngle);
  const i0 = polar(cx, cy, rInner, startAngle);
  return [
    `M ${o0.x} ${o0.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${o1.x} ${o1.y}`,
    `L ${i1.x} ${i1.y}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${i0.x} ${i0.y}`,
    "Z",
  ].join(" ");
}

export function SchedulePie({
  slices,
  totalHours,
  className,
  compact = false,
  centerValue,
  centerLabel = "booked",
}: {
  slices: SchedulePieSlice[];
  totalHours: number;
  className?: string;
  /** Smaller footprint for KPI / inline cards. */
  compact?: boolean;
  /** Override center primary text (defaults to formatted totalHours). */
  centerValue?: string;
  centerLabel?: string;
}) {
  const total = slices.reduce((s, x) => s + x.hours, 0);
  const size = 100;
  const cx = 50;
  const cy = 50;
  const rOuter = 48;
  const rInner = 26;
  const gapDeg = slices.length > 1 ? 1.5 : 0;
  const usable = Math.max(0, 360 - gapDeg * slices.length);

  const paths: { d: string; color: string; key: string }[] = [];
  if (total > 0) {
    let cursor = 0;
    for (const slice of slices) {
      const sliceDeg = (slice.hours / total) * usable;
      const start = cursor + gapDeg / 2;
      const end = cursor + sliceDeg + gapDeg / 2;
      const d = donutSlicePath(cx, cy, rOuter, rInner, start, end);
      if (d) {
        paths.push({ d, color: slice.color, key: slice.projectId });
      }
      cursor += sliceDeg + gapDeg;
    }
  }

  const primary = centerValue ?? formatHours(totalHours);

  return (
    <div
      className={cn(
        compact
          ? "relative size-14 shrink-0"
          : "relative size-[13rem] shrink-0 sm:size-[14.5rem]",
        className,
      )}
      role="img"
      aria-label={`Schedule pie: ${formatHours(totalHours)} booked`}
    >
      <svg viewBox={`0 0 ${size} ${size}`} className="size-full" aria-hidden>
        {paths.length === 0 ? (
          <circle
            cx={cx}
            cy={cy}
            r={(rOuter + rInner) / 2}
            fill="none"
            stroke="var(--border)"
            strokeWidth={rOuter - rInner}
          />
        ) : (
          paths.map((p) => (
            <path
              key={p.key}
              d={p.d}
              fill={p.color}
              stroke="var(--bg)"
              strokeWidth={0.6}
              strokeLinejoin="round"
            />
          ))
        )}
      </svg>
      <div className="pointer-events-none absolute inset-[26%] flex flex-col items-center justify-center rounded-full bg-[var(--bg)] text-center">
        <span
          className={cn(
            "font-semibold tabular-nums tracking-tight",
            compact ? "text-[10px] leading-none" : "text-sm",
          )}
        >
          {primary}
        </span>
        <span
          className={cn(
            "text-[var(--text-muted)]",
            compact ? "text-[7px] leading-none" : "text-[10px]",
          )}
        >
          {centerLabel}
        </span>
      </div>
    </div>
  );
}
