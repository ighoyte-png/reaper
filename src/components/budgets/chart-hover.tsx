"use client";

import {
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

export function progressWeekBandBounds(
  index: number,
  pointCount: number,
  padL: number,
  plotW: number,
): { x: number; width: number; centerX: number } {
  if (pointCount <= 1) {
    return { x: padL, width: plotW, centerX: padL + plotW / 2 };
  }
  const slotW = plotW / (pointCount - 1);
  const plotRight = padL + plotW;
  if (index <= 0) {
    const width = slotW / 2;
    return { x: padL, width, centerX: padL + width / 2 };
  }
  if (index >= pointCount - 1) {
    const x = padL + (pointCount - 1.5) * slotW;
    const width = plotRight - x;
    return { x, width, centerX: x + width / 2 };
  }
  const x = padL + (index - 0.5) * slotW;
  return { x, width: slotW, centerX: x + slotW / 2 };
}

export function slotWeekBandBounds(
  index: number,
  pointCount: number,
  padL: number,
  plotW: number,
): { x: number; width: number; centerX: number } {
  if (pointCount <= 0) {
    return { x: padL, width: plotW, centerX: padL + plotW / 2 };
  }
  const slotW = plotW / pointCount;
  const x = padL + slotW * index;
  return { x, width: slotW, centerX: x + slotW / 2 };
}

export const CHART_BUDGET_STROKE = "#ef4444";
export const CHART_BUDGET_DASH = "4 3";
export const CHART_TARGET_STROKE = "var(--status-near)";
export const CHART_LINE_STROKE_WIDTH = 1.25;
export const CHART_FUTURE_PATH_DASH = "5 4";
export const CHART_HOVER_TOP_STROKE = 1.25;

export function ChartHoverPattern({ id }: { id: string }) {
  return (
    <pattern
      id={id}
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
  );
}

export function ChartWeekHoverBand({
  patternId,
  x,
  width,
  padT,
  plotH,
}: {
  patternId: string;
  x: number;
  width: number;
  padT: number;
  plotH: number;
}) {
  return (
    <g pointerEvents="none">
      <rect x={x} y={padT} width={width} height={plotH} fill={`url(#${patternId})`} />
      <rect x={x} y={padT} width={width} height={plotH} fill="var(--accent)" fillOpacity={0.06} />
      <line x1={x} x2={x + width} y1={padT} y2={padT} stroke="var(--accent)" strokeWidth={1.25} />
    </g>
  );
}

export function useSvgChartAnchor(
  svgRef: RefObject<SVGSVGElement | null>,
  centerX: number | null,
  padT: number,
  viewW: number,
  viewH: number,
): { left: number; top: number } | null {
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);

  const update = () => {
    if (centerX == null) {
      setAnchor(null);
      return;
    }
    const svg = svgRef.current;
    if (!svg) {
      setAnchor(null);
      return;
    }
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      setAnchor(null);
      return;
    }
    setAnchor({
      left: rect.left + (centerX / viewW) * rect.width,
      top: rect.top + (padT / viewH) * rect.height,
    });
  };

  useLayoutEffect(() => {
    update();
  }, [centerX, padT, viewW, viewH, svgRef]);

  useEffect(() => {
    if (centerX == null) return;
    const onScrollOrResize = () => update();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [centerX, padT, viewW, viewH]);

  return anchor;
}

export function ChartHoverTooltip({
  anchor,
  children,
  showArrow = true,
}: {
  anchor: { left: number; top: number } | null;
  children: ReactNode;
  showArrow?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !anchor || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="pointer-events-none fixed z-[200] w-max max-w-[min(100vw-16px,18rem)] -translate-x-1/2 -translate-y-full"
      style={{ left: anchor.left, top: anchor.top - 8 }}
    >
      {children}
      {showArrow ? (
        <>
          <div className="mx-auto h-0 w-0 border-x-[6px] border-t-[6px] border-x-transparent border-t-[var(--border)]" aria-hidden />
          <div className="-mt-[7px] mx-auto h-0 w-0 border-x-[5px] border-t-[5px] border-x-transparent border-t-[var(--bg-elevated)]" aria-hidden />
        </>
      ) : null}
    </div>,
    document.body,
  );
}

export function columnAnchorFromRect(rect: DOMRect, bandTop: number) {
  return { left: rect.left + rect.width / 2, top: rect.top + bandTop };
}

export function useColumnAnchor(element: HTMLElement | null, bandTop: number) {
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!element) {
      setAnchor(null);
      return;
    }
    const update = () => setAnchor(columnAnchorFromRect(element.getBoundingClientRect(), bandTop));
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [element, bandTop]);
  return anchor;
}
