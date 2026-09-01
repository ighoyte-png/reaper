import { cn } from "@/lib/cn";
import { CHART_TODAY_COLOR } from "@/components/budgets/chart-hover";

const contractorColor = "var(--status-healthy)";

export function BudgetChartLegend({
  showContractor = false,
  showTargetCost = false,
  showMonthlyBudget = false,
  showProjectBudget = false,
  showToday = false,
  monthlyBudgetLabel,
  className,
}: {
  showContractor?: boolean;
  showTargetCost?: boolean;
  showMonthlyBudget?: boolean;
  showProjectBudget?: boolean;
  showToday?: boolean;
  /** e.g. "20h" or "$5,000" */
  monthlyBudgetLabel?: string;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--text-muted)]",
        className,
      )}
    >
      {showContractor ? (
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: contractorColor }}
            aria-hidden
          />
          Contractor
        </span>
      ) : null}
      <span className="inline-flex items-center gap-1">
        <span
          className="inline-block h-2 w-2 rounded-full bg-[var(--accent)]"
          aria-hidden
        />
        Internal
      </span>
      {showTargetCost ? (
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-0 w-3 border-t border-dashed border-[var(--status-near)]"
            aria-hidden
          />
          Target Cost
        </span>
      ) : null}
      {showMonthlyBudget ? (
        <span className="inline-flex items-center gap-1">
          Monthly Budget
          {monthlyBudgetLabel ? ` ${monthlyBudgetLabel}` : null}
          <span className="text-[#ef4444]">— —</span>
        </span>
      ) : null}
      {showProjectBudget ? (
        <span className="inline-flex items-center gap-1">
          Project Budget
          <span className="text-[#ef4444]">— —</span>
        </span>
      ) : null}
      {showToday ? (
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: CHART_TODAY_COLOR }}
            aria-hidden
          />
          Today
        </span>
      ) : null}
      <span>Hatched = Future / Planned</span>
    </p>
  );
}
