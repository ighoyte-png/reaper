import { cn } from "@/lib/cn";
import { formatHours } from "@/lib/domain/budget";
import {
  capacityLevelFillClass,
  capacityLevelTextClass,
} from "@/lib/domain/capacity";
import type { CapacityLevel } from "@/lib/types";

export function CapacityBar({
  booked,
  available,
  level,
  label,
}: {
  booked: number;
  available: number;
  level: CapacityLevel;
  label: string;
}) {
  const pct =
    available <= 0
      ? booked > 0
        ? 100
        : 0
      : Math.min(100, (booked / available) * 100);
  const over = available > 0 && booked > available;

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
      <div className="h-2 overflow-hidden rounded-full bg-[var(--border)]">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            capacityLevelFillClass(level),
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
