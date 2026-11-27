"use client";

import { cn } from "@/lib/cn";

/** Compact indicator that a project is synced to ClickUp. */
export function ClickUpSyncedBadge({
  className,
  compact = false,
}: {
  className?: string;
  /** Tighter padding for dense list rows. */
  compact?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded bg-[var(--bg-elevated)] font-medium uppercase tracking-wide text-[var(--text-muted)]",
        compact
          ? "px-1.5 py-0.5 text-[10px]"
          : "px-1.5 py-0.5 text-[10px]",
        className,
      )}
      title="Synced to ClickUp"
    >
      <ClickUpMark className="size-2.5 shrink-0 opacity-80" />
      ClickUp
    </span>
  );
}

/** Minimal ClickUp-style mark (not an official trademark asset). */
function ClickUpMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        d="M2.5 4.5L8 2l5.5 2.5L8 14 2.5 4.5z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path
        d="M5 7.25L7.25 9.5 11 5.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
