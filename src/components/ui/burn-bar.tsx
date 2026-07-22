import { clsx } from "clsx";
import type { BudgetBurn } from "@/lib/types";
import { budgetHealth, formatHours, formatMoney } from "@/lib/domain/budget";

const hatchStyle = {
  backgroundImage:
    "repeating-linear-gradient(-45deg, transparent, transparent 3px, var(--progress-approved-hatch) 3px, var(--progress-approved-hatch) 5px)",
} as const;

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
  const isAmount = burn.mode === "amount";
  const budget = isAmount ? (burn.totalAmount ?? 0) : burn.totalHours;
  const used = isAmount ? burn.usedAmount : burn.usedHours;
  const future = isAmount ? burn.futureAmount : burn.futureHours;

  const usedPct = budget > 0 ? (used / budget) * 100 : 0;
  const futurePct = budget > 0 ? (future / budget) * 100 : 0;

  const fillClass = clsx(
    health === "over" && "bg-[var(--status-over)]",
    health === "near" && "bg-[var(--status-near)]",
    (health === "healthy" || health === "none") && "bg-[var(--accent)]",
  );

  const hasUsed = usedPct > 0;
  const hasFuture = futurePct > 0;

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
      <div
        className={clsx(
          "flex overflow-hidden rounded-full bg-[var(--border)]",
          compact ? "h-3.5" : "h-4",
        )}
        title={
          future > 0
            ? isAmount
              ? `${formatMoney(used)} used · ${formatMoney(future)} planned`
              : `${formatHours(used)} used · ${formatHours(future)} planned`
            : undefined
        }
      >
        {hasUsed ? (
          <div
            className={clsx(
              "h-full shrink-0",
              fillClass,
              hasFuture ? "rounded-l-full" : "rounded-full",
            )}
            style={{ width: `${usedPct}%` }}
          />
        ) : null}
        {hasFuture ? (
          <div
            className={clsx(
              "relative h-full min-w-0 shrink-0 overflow-hidden",
              fillClass,
              hasUsed
                ? "rounded-r-full border-l border-[var(--progress-approved-hatch)]"
                : "rounded-full",
            )}
            style={{ width: `${futurePct}%` }}
          >
            <div
              className={clsx(
                "absolute inset-0",
                hasUsed ? "rounded-r-full" : "rounded-full",
              )}
              style={hatchStyle}
              aria-hidden
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
