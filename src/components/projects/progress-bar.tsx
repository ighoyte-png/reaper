"use client";

import { cn } from "@/lib/cn";

export function ProgressBar({
  pct,
  label,
  approved,
  size = "md",
}: {
  pct: number;
  label?: string;
  approved?: boolean;
  size?: "md" | "lg";
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className="space-y-1">
      {label ? (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="truncate font-medium">{label}</span>
          <span className="shrink-0 text-[var(--text-muted)]">
            {clamped}%
            {approved ? (
              <span className="ml-1 text-[var(--status-healthy)]">Approved</span>
            ) : null}
          </span>
        </div>
      ) : null}
      <div
        className={cn(
          "overflow-hidden rounded-full bg-[var(--bg-elevated)]",
          size === "lg" ? "h-4" : "h-2.5",
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            approved ? "bg-[var(--status-healthy)]" : "bg-[var(--accent)]",
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
