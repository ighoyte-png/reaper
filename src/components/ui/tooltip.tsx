"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Tooltip({
  content,
  children,
  className,
}: {
  content: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  if (!content.trim()) return <>{children}</>;

  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span aria-describedby={open ? id : undefined}>{children}</span>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 w-max max-w-[220px] -translate-x-1/2 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-left text-[11px] font-normal leading-snug text-[var(--text)] shadow-lg"
        >
          {content}
        </span>
      )}
    </span>
  );
}
