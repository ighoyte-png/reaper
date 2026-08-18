import type { CapacityLevel } from "@/lib/types";

export type BurnFillTone = "contractor" | "internal" | "warning" | "over";

export type BurnFillSeg = {
  width: number;
  tone: BurnFillTone;
  hatched: boolean;
};

export type UtilizationFillTone = "healthy" | "near" | "over" | "low";

export type UtilizationFillSeg = {
  width: number;
  tone: UtilizationFillTone;
};

/**
 * Split contractor / internal used / future along the warning threshold.
 * Contractor stays green in the warning zone; over paints every segment red.
 */
export function burnBarFillSegments(args: {
  contractorPct: number;
  usedPct: number;
  futurePct: number;
  health: "healthy" | "near" | "over" | "none";
  warningPct: number;
}): BurnFillSeg[] {
  const raw: { width: number; role: "contractor" | "used" | "future" }[] = [
    { width: args.contractorPct, role: "contractor" as const },
    { width: args.usedPct, role: "used" as const },
    { width: args.futurePct, role: "future" as const },
  ].filter((s) => s.width > 0.001);

  if (args.health === "over") {
    return raw.map((s) => ({
      width: s.width,
      tone: "over" as const,
      hatched: s.role === "future",
    }));
  }

  if (args.health !== "near") {
    return raw.map((s) => ({
      width: s.width,
      tone: (s.role === "contractor" ? "contractor" : "internal") as BurnFillTone,
      hatched: s.role === "future",
    }));
  }

  const warn = args.warningPct;
  const out: BurnFillSeg[] = [];
  let cursor = 0;
  for (const s of raw) {
    const start = cursor;
    const end = cursor + s.width;
    cursor = end;
    const hatched = s.role === "future";
    if (s.role === "contractor") {
      out.push({ width: s.width, tone: "contractor", hatched });
      continue;
    }
    if (end <= warn + 0.001) {
      out.push({ width: s.width, tone: "internal", hatched });
    } else if (start >= warn - 0.001) {
      out.push({ width: s.width, tone: "warning", hatched });
    } else {
      const internalW = warn - start;
      const warningW = end - warn;
      if (internalW > 0.001) {
        out.push({ width: internalW, tone: "internal", hatched });
      }
      if (warningW > 0.001) {
        out.push({ width: warningW, tone: "warning", hatched });
      }
    }
  }
  return out;
}

/**
 * Utilization fill: gray while underutilized, green up to the warning
 * threshold, orange only in the warning band, full red when over.
 */
export function utilizationBarSlices(
  fillPct: number,
  level: CapacityLevel,
  nearPct: number,
): UtilizationFillSeg[] {
  const fill = Math.max(0, Math.min(100, fillPct));
  if (fill <= 0) return [];
  if (level === "over") return [{ width: fill, tone: "over" }];
  if (level === "low" || level === "unavailable") {
    return [{ width: fill, tone: "low" }];
  }
  if (level === "near") {
    const warn = Math.max(0, Math.min(100, nearPct));
    const green = Math.min(fill, warn);
    const orange = Math.max(0, fill - warn);
    const out: UtilizationFillSeg[] = [];
    if (green > 0.001) out.push({ width: green, tone: "healthy" });
    if (orange > 0.001) out.push({ width: orange, tone: "near" });
    return out.length > 0 ? out : [{ width: fill, tone: "healthy" }];
  }
  return [{ width: fill, tone: "healthy" }];
}

export function burnFillClass(tone: BurnFillTone): string {
  switch (tone) {
    case "contractor":
      return "bg-[var(--status-healthy)]";
    case "internal":
      return "bg-[var(--accent)]";
    case "warning":
      return "bg-[var(--status-near)]";
    case "over":
      return "bg-[var(--status-over)]";
  }
}

export function utilizationFillClass(tone: UtilizationFillTone): string {
  switch (tone) {
    case "healthy":
      return "bg-[var(--status-healthy)]";
    case "near":
      return "bg-[var(--status-near)]";
    case "over":
      return "bg-[var(--status-over)]";
    case "low":
      return "bg-[var(--status-unavailable)]";
  }
}
