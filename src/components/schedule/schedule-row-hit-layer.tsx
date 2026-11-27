"use client";

import { useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  columnAtOffsetPx,
  columnGuideBackground,
  columnOffsetPx,
  spanColumnsPx,
  type ScheduleColumn,
} from "@/lib/domain/schedule-zoom";
import { cn } from "@/lib/cn";

type Props = {
  columns: ScheduleColumn[];
  width: number;
  height: number;
  /** Draft / paint range highlight. */
  rangeStart?: string | null;
  rangeEnd?: string | null;
  rangeClassName?: string;
  /** Soft fills (e.g. leave) as date ranges. */
  fillRanges?: { start: string; end: string }[];
  fillClassName?: string;
  /**
   * Columns in these ranges are grayed out and non-interactive
   * (e.g. outside a project timeline for weekly recurrence).
   */
  disabledRanges?: { start: string; end: string }[];
  disabledClassName?: string;
  interactive?: boolean;
  title?: string;
  cursorClassName?: string;
  hoverClassName?: string;
  onColumnPointerEnter?: (col: ScheduleColumn) => void;
  onColumnPointerDown?: (
    col: ScheduleColumn,
    e: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  onColumnClick?: (col: ScheduleColumn) => void;
};

function columnInRanges(
  key: string,
  ranges: { start: string; end: string }[] | undefined,
): boolean {
  if (!ranges?.length) return false;
  return ranges.some((r) => key >= r.start && key <= r.end);
}

/**
 * One DOM hit surface per schedule row instead of ~100 cell nodes.
 * Column guides are CSS; highlights are a few absolute overlays.
 */
export function ScheduleRowHitLayer({
  columns,
  width,
  height,
  rangeStart = null,
  rangeEnd = null,
  rangeClassName = "bg-[var(--accent)]/35",
  fillRanges,
  fillClassName = "bg-[var(--leave-block-fill)]",
  disabledRanges,
  disabledClassName = "bg-[var(--text-muted)]/12",
  interactive = false,
  title,
  cursorClassName,
  hoverClassName = "bg-[var(--accent)]/20",
  onColumnPointerEnter,
  onColumnPointerDown,
  onColumnClick,
}: Props) {
  const [hoverColId, setHoverColId] = useState<string | null>(null);

  const guideStyle = useMemo(() => columnGuideBackground(columns), [columns]);

  const todayGeo = useMemo(() => {
    const today = columns.find((c) => c.isToday);
    if (!today) return null;
    const idx = columns.indexOf(today);
    return { left: columnOffsetPx(columns, idx), width: today.width };
  }, [columns]);

  const rangeGeo =
    rangeStart && rangeEnd
      ? spanColumnsPx(columns, rangeStart, rangeEnd)
      : null;

  const hoverCol = hoverColId
    ? (columns.find((c) => c.id === hoverColId) ?? null)
    : null;
  const hoverDisabled = hoverCol
    ? columnInRanges(hoverCol.startKey, disabledRanges)
    : false;
  const hoverGeo = hoverCol
    ? {
        left: columnOffsetPx(columns, columns.indexOf(hoverCol)),
        width: hoverCol.width,
      }
    : null;

  const fills = useMemo(() => {
    if (!fillRanges || fillRanges.length === 0) return [];
    const out: { left: number; width: number; key: string }[] = [];
    for (const r of fillRanges) {
      const geo = spanColumnsPx(columns, r.start, r.end);
      if (geo) out.push({ ...geo, key: `${r.start}:${r.end}` });
    }
    return out;
  }, [columns, fillRanges]);

  const disabledFills = useMemo(() => {
    if (!disabledRanges || disabledRanges.length === 0) return [];
    const out: { left: number; width: number; key: string }[] = [];
    for (const r of disabledRanges) {
      const geo = spanColumnsPx(columns, r.start, r.end);
      if (geo) out.push({ ...geo, key: `dis:${r.start}:${r.end}` });
    }
    return out;
  }, [columns, disabledRanges]);

  function colFromClientX(
    el: HTMLDivElement,
    clientX: number,
  ): ScheduleColumn | null {
    const rect = el.getBoundingClientRect();
    return columnAtOffsetPx(columns, clientX - rect.left);
  }

  return (
    <div
      className={cn(
        "absolute inset-0 z-0",
        interactive && (hoverDisabled ? "cursor-not-allowed" : cursorClassName),
      )}
      style={{ width, height, ...guideStyle }}
      title={title}
      onPointerEnter={(e) => {
        const col = colFromClientX(e.currentTarget, e.clientX);
        if (!col) return;
        setHoverColId(col.id);
        if (columnInRanges(col.startKey, disabledRanges)) return;
        onColumnPointerEnter?.(col);
      }}
      onPointerMove={(e) => {
        const col = colFromClientX(e.currentTarget, e.clientX);
        if (!col) return;
        if (col.id !== hoverColId) setHoverColId(col.id);
        if (columnInRanges(col.startKey, disabledRanges)) return;
        onColumnPointerEnter?.(col);
      }}
      onPointerLeave={() => setHoverColId(null)}
      onPointerDown={(e) => {
        const col = colFromClientX(e.currentTarget, e.clientX);
        if (!col) return;
        setHoverColId(col.id);
        if (columnInRanges(col.startKey, disabledRanges)) {
          e.preventDefault();
          return;
        }
        onColumnPointerDown?.(col, e);
      }}
      onClick={(e) => {
        const col = colFromClientX(e.currentTarget, e.clientX);
        if (!col) return;
        if (columnInRanges(col.startKey, disabledRanges)) {
          e.preventDefault();
          return;
        }
        onColumnClick?.(col);
      }}
    >
      {todayGeo && !rangeGeo ? (
        <div
          className="pointer-events-none absolute inset-y-0"
          style={{
            left: todayGeo.left,
            width: todayGeo.width,
            backgroundColor: "var(--today-col)",
          }}
        />
      ) : null}
      {disabledFills.map((f) => (
        <div
          key={f.key}
          className={cn(
            "pointer-events-none absolute inset-y-0",
            disabledClassName,
          )}
          style={{ left: f.left, width: f.width }}
        />
      ))}
      {fills.map((f) => (
        <div
          key={f.key}
          className={cn("pointer-events-none absolute inset-y-0", fillClassName)}
          style={{ left: f.left, width: f.width }}
        />
      ))}
      {rangeGeo ? (
        <div
          className={cn("pointer-events-none absolute inset-y-0", rangeClassName)}
          style={{ left: rangeGeo.left, width: rangeGeo.width }}
        />
      ) : null}
      {hoverGeo && interactive && !rangeGeo && !hoverDisabled ? (
        <div
          className={cn("pointer-events-none absolute inset-y-0", hoverClassName)}
          style={{ left: hoverGeo.left, width: hoverGeo.width }}
        />
      ) : null}
    </div>
  );
}
