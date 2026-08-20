"use client";

import { LayoutGrid, LayoutList } from "lucide-react";
import { cn } from "@/lib/cn";
import type { DirectoryLayout } from "@/lib/user-view-prefs";

export function ListCardsViewToggle({
  value,
  onChange,
  className,
  disableCards = false,
}: {
  value: DirectoryLayout;
  onChange: (next: DirectoryLayout) => void;
  className?: string;
  /** When true, cards mode is unavailable (e.g. phone directories). */
  disableCards?: boolean;
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
          "inline-flex h-8 w-8 items-center justify-center border-l border-[var(--border)]",
          disableCards
            ? "cursor-not-allowed opacity-40"
            : "cursor-pointer",
          value === "cards" && !disableCards && "bg-[var(--row-hover)]",
        )}
        onClick={() => {
          if (disableCards) return;
          onChange("cards");
        }}
        disabled={disableCards}
        aria-label="Cards view"
        aria-pressed={value === "cards"}
        title={disableCards ? "Cards view available on desktop" : "Cards view"}
      >
        <LayoutGrid size={14} />
      </button>
    </div>
  );
}
