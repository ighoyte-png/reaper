import { StatCountBadge } from "@/components/ui/stat-count-badge";
import { cn } from "@/lib/cn";

export type BudgetStatusFilter =
  | "all"
  | "tracked"
  | "healthy"
  | "near"
  | "over";

/** Tracked / On Track / Near Budget / Over Budget status line for reports. */
export function BudgetStatusLine({
  all,
  tracked,
  healthy,
  near,
  over,
  className,
  active,
  onSelect,
}: {
  /** Total projects in the current PM/client/search scope. */
  all?: number;
  tracked: number;
  healthy: number;
  near: number;
  over: number;
  className?: string;
  /** When set with onSelect, items become filters. */
  active?: BudgetStatusFilter;
  onSelect?: (next: BudgetStatusFilter) => void;
}) {
  const interactive = Boolean(onSelect);
  const selected = active ?? "all";

  const items: {
    id: BudgetStatusFilter;
    label: string;
    count: number;
    badgeClass: string;
  }[] = [
    ...(all != null
      ? [
          {
            id: "all" as const,
            label: "All Projects",
            count: all,
            badgeClass: "bg-[var(--accent)]",
          },
        ]
      : []),
    {
      id: "tracked",
      label: "Tracked Projects",
      count: tracked,
      badgeClass: "bg-[var(--status-unavailable)]",
    },
    {
      id: "healthy",
      label: "On Track",
      count: healthy,
      badgeClass: "bg-[var(--status-healthy)]",
    },
    {
      id: "near",
      label: "Near Budget",
      count: near,
      badgeClass: "bg-[var(--status-near)]",
    },
    {
      id: "over",
      label: "Over Budget",
      count: over,
      badgeClass: "bg-[var(--status-over)]",
    },
  ];

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[var(--text)]",
        className,
      )}
      role={interactive ? "toolbar" : undefined}
      aria-label={interactive ? "Budget status filters" : undefined}
    >
      {items.map((item) => {
        const isActive = interactive && selected === item.id;
        const content = (
          <>
            <StatCountBadge count={item.count} className={item.badgeClass} />
            {item.label}
          </>
        );
        if (!interactive || !onSelect) {
          return (
            <span key={item.id} className="inline-flex items-center gap-1.5">
              {content}
            </span>
          );
        }
        return (
          <button
            key={item.id}
            type="button"
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors",
              isActive
                ? "bg-[var(--row-hover)] font-medium text-[var(--text)]"
                : "text-[var(--text)] hover:bg-[var(--row-hover)]",
            )}
            aria-pressed={isActive}
            onClick={() => onSelect(item.id)}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
