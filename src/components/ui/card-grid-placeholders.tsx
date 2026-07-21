"use client";

import { Plus } from "lucide-react";
import { cn } from "@/lib/cn";

/** Empty dashed slots to fill the last row of a responsive card grid. */
export function CardGridPlaceholders({
  count,
  smColumns = 2,
  xlColumns = 3,
  className = "min-h-[10rem]",
  onAdd,
  addLabel = "Add Project",
}: {
  /** Number of real cards already in the grid. */
  count: number;
  smColumns?: number;
  xlColumns?: number;
  className?: string;
  /** When set, hover reveals an add action inside each placeholder. */
  onAdd?: () => void;
  addLabel?: string;
}) {
  const smPad = (smColumns - (count % smColumns)) % smColumns;
  const xlPad = (xlColumns - (count % xlColumns)) % xlColumns;

  const slots = [
    ...Array.from({ length: smPad }, (_, i) => ({
      id: `sm-ph-${i}`,
      visibleClass: "hidden sm:flex xl:hidden",
    })),
    ...Array.from({ length: xlPad }, (_, i) => ({
      id: `xl-ph-${i}`,
      visibleClass: "hidden xl:flex",
    })),
  ];

  return (
    <>
      {slots.map((slot) =>
        onAdd ? (
          <div
            key={slot.id}
            className={cn(
              "group relative items-center justify-center rounded-md border-2 border-dashed border-[var(--text-muted)]/35 transition-colors hover:border-[var(--text-muted)]/55 hover:bg-[var(--row-hover)]",
              className,
              slot.visibleClass,
            )}
          >
            <button
              type="button"
              onClick={onAdd}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-xs font-medium text-[var(--text)] opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-[var(--bg-elevated)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <Plus size={14} strokeWidth={2} />
              {addLabel}
            </button>
          </div>
        ) : (
          <div
            key={slot.id}
            aria-hidden
            className={cn(
              "rounded-md border-2 border-dashed border-[var(--text-muted)]/35",
              className,
              slot.visibleClass.replace("flex", "block"),
            )}
          />
        ),
      )}
    </>
  );
}
