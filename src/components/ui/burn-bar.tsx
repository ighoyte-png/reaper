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
  const health = budgetHealth(burn);
  const width = Math.min(100, burn.pct);

  return (
    <div className="min-w-0">
      {!compact && (
        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
          <span className="text-[var(--text-muted)]">
            {formatHours(burn.plannedHours)} / {formatHours(burn.totalHours)}
          </span>
          <span
            className={clsx(
              health === "over" && "text-[var(--status-over)]",
              health === "near" && "text-[var(--status-near)]",
              health === "healthy" && "text-[var(--text-muted)]",
            )}
          >
            {burn.overBy > 0
              ? `${formatHours(burn.overBy)} over`
              : `${formatHours(Math.max(0, burn.remainingHours))} left`}
          </span>
        </div>
      )}
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
        <div
          className={clsx(
            "h-full rounded-full transition-all",
            health === "over" && "bg-[var(--status-over)]",
            health === "near" && "bg-[var(--status-near)]",
            health === "healthy" && "bg-[var(--accent)]",
          )}
          style={{ width: `${width}%` }}
        />
      </div>
      {!compact && burn.totalAmount != null && (
        <div className="mt-1 text-[11px] text-[var(--text-muted)]">
          {formatMoney(burn.plannedAmount)} / {formatMoney(burn.totalAmount)}
          {burn.amountOverBy > 0
            ? ` · ${formatMoney(burn.amountOverBy)} over`
            : ""}
        </div>
      )}
    </div>
  );
}
