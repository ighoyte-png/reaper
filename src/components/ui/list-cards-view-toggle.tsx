"use client";

import { LayoutGrid, LayoutList } from "lucide-react";
import { cn } from "@/lib/cn";
import type { DirectoryLayout } from "@/lib/user-view-prefs";

export function ListCardsViewToggle({
  value,
  onChange,
  className,
}: {
  value: DirectoryLayout;
  onChange: (next: DirectoryLayout) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex shrink-0 rounded-md border border-[var(--border)] text-xs",
        className,
      )}
      role="group"
      aria-label="Directory layout"
    >
      <button
        type="button"
        className={cn(
          "inline-flex h-8 w-8 cursor-pointer items-center justify-center",
          value === "list" && "bg-[var(--row-hover)]",
        )}
        onClick={() => onChange("list")}
        aria-label="List view"
        aria-pressed={value === "list"}
        title="List view"
      >
        <LayoutList size={14} />
      </button>
      <button
        type="button"
        className={cn(
          "inline-flex h-8 w-8 cursor-pointer items-center justify-center border-l border-[var(--border)]",
          value === "cards" && "bg-[var(--row-hover)]",
        )}
        onClick={() => onChange("cards")}
        aria-label="Cards view"
        aria-pressed={value === "cards"}
        title="Cards view"
      >
        <LayoutGrid size={14} />
      </button>
    </div>
  );
}
