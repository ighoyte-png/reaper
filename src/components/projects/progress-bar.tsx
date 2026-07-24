"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

/** Same format as ProjectManagerTag — green for milestone client approval. */
export function MilestoneApprovedTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded bg-[var(--status-healthy)]/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--status-healthy)]",
        className,
      )}
    >
      Approved
    </span>
  );
}

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
    <div className="flex items-stretch gap-2">
      <div className="min-w-0 flex-1 space-y-1">
        {label ? (
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-1.5">
              {approved ? <MilestoneApprovedTag /> : null}
              <span className="min-w-0 truncate font-medium">{label}</span>
            </span>
            <span className="shrink-0 text-[var(--text-muted)]">{clamped}%</span>
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
              isComplete
                ? "bg-[var(--status-healthy)]"
                : "bg-[var(--accent)]",
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
            <span className="shrink-0 truncate text-right">
              {footerEnd ?? ""}
            </span>
          </div>
        ) : null}
      </div>
      {approved ? (
        <div
          className="flex shrink-0 items-center justify-center self-stretch px-0.5"
          aria-hidden
        >
          <Check
            size={size === "lg" ? 22 : 18}
            strokeWidth={2.5}
            className="text-[var(--status-healthy)]"
          />
        </div>
      ) : null}
    </div>
  );
}
