"use client";

import { cn } from "@/lib/cn";

export function PeriodChip({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "rounded-md border px-2.5 py-1 text-sm font-medium transition-colors",
        selected
          ? "border-[var(--text)] bg-[var(--bg-elevated)] text-[var(--text)]"
          : "border-transparent text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
      )}
    >
      {label}
    </button>
  );
}
