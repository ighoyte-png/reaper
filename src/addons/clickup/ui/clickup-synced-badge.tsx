"use client";

import { useId, type MouseEvent } from "react";
import { cn } from "@/lib/cn";

/** Compact indicator that a project is synced to ClickUp. */
export function ClickUpSyncedBadge({
  className,
  compact = false,
  href,
}: {
  className?: string;
  /** Tighter padding for dense list rows. */
  compact?: boolean;
  /** Opens the linked ClickUp folder in a new tab when set. */
  href?: string | null;
}) {
  const label = href ? "Open in ClickUp" : "Synced to ClickUp";
  const shellClass = cn(
    "inline-flex shrink-0 items-center justify-center rounded bg-[var(--bg-elevated)]",
    compact ? "size-5" : "size-6",
    href &&
      "transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]",
    className,
  );
  const mark = (
    <ClickUpMark className={cn("shrink-0", compact ? "size-3" : "size-3.5")} />
  );

  if (!href) {
    return (
      <span className={shellClass} title={label} aria-label={label}>
        {mark}
      </span>
    );
  }

  // Button (not <a>) so cards/rows can wrap this in a Next.js Link without nested anchors.
  function onClick(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    window.open(href!, "_blank", "noopener,noreferrer");
  }

  return (
    <button
      type="button"
      className={cn(shellClass, "cursor-pointer")}
      title={label}
      aria-label={label}
      onClick={onClick}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {mark}
    </button>
  );
}

/** Official ClickUp logo mark (gradients). */
function ClickUpMark({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const g1 = `cu-badge-g1-${uid}`;
  const g2 = `cu-badge-g2-${uid}`;

  return (
    <svg
      viewBox="0 0 54.8 65.8"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient
          id={g1}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="15.0492"
          x2="54.8446"
          y2="15.0492"
          gradientTransform="matrix(1 0 0 -1 0 69.3604)"
        >
          <stop offset="0" stopColor="#8930FD" />
          <stop offset="1" stopColor="#49CCF9" />
        </linearGradient>
        <linearGradient
          id={g2}
          gradientUnits="userSpaceOnUse"
          x1="1.1953"
          y1="53.166"
          x2="53.7447"
          y2="53.166"
          gradientTransform="matrix(1 0 0 -1 0 69.3604)"
        >
          <stop offset="0" stopColor="#FF02F0" />
          <stop offset="1" stopColor="#FFC800" />
        </linearGradient>
      </defs>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill={`url(#${g1})`}
        d="M0,50.6l10.1-7.8c5.4,7,11.1,10.3,17.4,10.3c6.3,0,11.9-3.2,17-10.2l10.3,7.6c-7.4,10-16.6,15.3-27.3,15.3C16.9,65.8,7.6,60.5,0,50.6z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill={`url(#${g2})`}
        d="M27.5,16.9l-18,15.5l-8.3-9.7L27.6,0l26.2,22.7l-8.4,9.6L27.5,16.9z"
      />
    </svg>
  );
}
