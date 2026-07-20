"use client";

import { cn } from "@/lib/cn";

export function ProgressBar({
  pct,
  label,
  approved,
  size = "md",
  footerStart,
  footerEnd,
}: {
  pct: number;
  label?: string;
  approved?: boolean;
  size?: "md" | "lg";
  footerStart?: string | null;
  footerEnd?: string | null;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const isComplete = clamped >= 100;
  const showFooter = Boolean(footerStart || footerEnd);
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
          "relative overflow-hidden rounded-full bg-[var(--bg-elevated)]",
          size === "lg" ? "h-4" : "h-2.5",
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            isComplete ? "bg-[var(--status-healthy)]" : "bg-[var(--accent)]",
          )}
          style={{ width: `${clamped}%` }}
        />
        {approved ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              backgroundImage:
                "repeating-linear-gradient(-45deg, transparent, transparent 3px, var(--progress-approved-hatch) 3px, var(--progress-approved-hatch) 5px)",
            }}
          />
        ) : null}
      </div>
      {showFooter ? (
        <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
          <span className="truncate">{footerStart ?? ""}</span>
          <span className="shrink-0 truncate text-right">{footerEnd ?? ""}</span>
        </div>
      ) : null}
    </div>
  );
}
