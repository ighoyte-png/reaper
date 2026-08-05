import { StatCountBadge } from "@/components/ui/stat-count-badge";
import { cn } from "@/lib/cn";

/** Tracked / On Track / Near Budget / Over Budget status line for reports. */
export function BudgetStatusLine({
  tracked,
  healthy,
  near,
  over,
  className,
}: {
  tracked: number;
  healthy: number;
  near: number;
  over: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[var(--text)]",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        <StatCountBadge
          count={tracked}
          className="bg-[var(--status-unavailable)]"
        />
        Tracked Projects
      </span>
      <span className="inline-flex items-center gap-1.5">
        <StatCountBadge
          count={healthy}
          className="bg-[var(--status-healthy)]"
        />
        On Track
      </span>
      <span className="inline-flex items-center gap-1.5">
        <StatCountBadge count={near} className="bg-[var(--status-near)]" />
        Near Budget
      </span>
      <span className="inline-flex items-center gap-1.5">
        <StatCountBadge count={over} className="bg-[var(--status-over)]" />
        Over Budget
      </span>
    </div>
  );
}
