import { cn } from "@/lib/cn";
import { formatHours } from "@/lib/domain/budget";
import { capacityLevelTextClass } from "@/lib/domain/capacity";
import {
  utilizationBarSlices,
  utilizationFillClass,
} from "@/lib/domain/bar-fill";
import { BarFillPill } from "@/components/ui/bar-fill-pill";
import { DEFAULT_ORG_BUDGET_SETTINGS } from "@/lib/domain/org-settings";
import type { CapacityLevel } from "@/lib/types";

export function CapacityBar({
  booked,
  available,
  level,
  label,
  nearPct = DEFAULT_ORG_BUDGET_SETTINGS.capacity_near_pct,
}: {
  booked: number;
  available: number;
  level: CapacityLevel;
  label: string;
  /** Admin warning threshold; orange applies only above this percent. */
  nearPct?: number;
}) {
  const pct =
    available <= 0
      ? booked > 0
        ? 100
        : 0
      : Math.min(100, (booked / available) * 100);
  const over = available > 0 && booked > available;
  const slices = utilizationBarSlices(pct, level, nearPct);
  const fillPct = slices.reduce((sum, slice) => sum + slice.width, 0);

  return (
    <div className="min-w-0 space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="truncate font-medium text-[var(--text)]">{label}</span>
        <span
          className={cn(
            "shrink-0 text-xs tabular-nums",
            level === "over" || level === "near"
              ? capacityLevelTextClass(level)
              : "text-[var(--text-muted)]",
          )}
        >
          {formatHours(booked)} / {formatHours(available)}
          {over ? " · over" : ""}
        </span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-[var(--border)]">
        <BarFillPill totalPct={fillPct}>
          {slices.map((slice, idx) => (
            <div
              key={`${slice.tone}-${idx}`}
              className={cn("h-full min-w-0", utilizationFillClass(slice.tone))}
              style={{ flex: `${slice.width} 0 0` }}
            />
          ))}
        </BarFillPill>
      </div>
    </div>
  );
}
