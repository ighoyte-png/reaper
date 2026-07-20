import { clsx } from "clsx";
import type { BudgetBurn } from "@/lib/types";
import { budgetHealth, formatHours, formatMoney } from "@/lib/domain/budget";

export function BurnBar({
  burn,
  compact = false,
}: {
  burn: BudgetBurn;
  compact?: boolean;
}) {
  if (burn.mode === "none") {
    if (compact) return null;
    return (
      <p className="text-xs text-[var(--text-muted)]">No budget tracking</p>
    );
  }

  const health = budgetHealth(burn);
  const width = Math.min(100, burn.pct);
  const isAmount = burn.mode === "amount";

  return (
    <div className="min-w-0">
      {!compact && (
        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
          <span className="text-[var(--text-muted)]">
            {isAmount
              ? `${formatMoney(burn.plannedAmount)} / ${formatMoney(burn.totalAmount ?? 0)}`
              : `${formatHours(burn.plannedHours)} / ${formatHours(burn.totalHours)}`}
          </span>
          <span
            className={clsx(
              health === "over" && "text-[var(--status-over)]",
              health === "near" && "text-[var(--status-near)]",
              (health === "healthy" || health === "none") &&
                "text-[var(--text-muted)]",
            )}
          >
            {isAmount
              ? burn.amountOverBy > 0
                ? `${formatMoney(burn.amountOverBy)} over`
                : `${formatMoney(Math.max(0, burn.remainingAmount ?? 0))} left`
              : burn.overBy > 0
                ? `${formatHours(burn.overBy)} over`
                : `${formatHours(Math.max(0, burn.remainingHours))} left`}
          </span>
        </div>
      )}
      <div className="h-3 overflow-hidden rounded-full bg-[var(--border)]">
        <div
          className={clsx(
            "h-full rounded-full transition-all",
            health === "over" && "bg-[var(--status-over)]",
            health === "near" && "bg-[var(--status-near)]",
            (health === "healthy" || health === "none") && "bg-[var(--accent)]",
          )}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
