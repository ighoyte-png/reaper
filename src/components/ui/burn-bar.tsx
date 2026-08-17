import { clsx } from "clsx";
import type { BudgetBurn, OrganizationSettings } from "@/lib/types";
import { budgetHealth, formatHours, formatMoney } from "@/lib/domain/budget";
import type { CurrencyCode } from "@/lib/types";
import { DEFAULT_ORG_BUDGET_SETTINGS } from "@/lib/domain/org-settings";

const hatchStyle = {
  backgroundImage:
    "repeating-linear-gradient(-45deg, transparent, transparent 3px, var(--progress-approved-hatch) 3px, var(--progress-approved-hatch) 5px)",
} as const;

export function BurnBar({
  burn,
  compact = false,
  settings = DEFAULT_ORG_BUDGET_SETTINGS,
  currency = null,
}: {
  burn: BudgetBurn;
  compact?: boolean;
  settings?: OrganizationSettings;
  currency?: CurrencyCode | null;
}) {
  if (burn.mode === "none") {
    if (compact) return null;
    return (
      <p className="text-xs text-[var(--text-muted)]">No budget tracking</p>
    );
  }

  const health = budgetHealth(burn, settings);
  const isAmount = burn.mode === "amount";
  const budget = isAmount ? (burn.totalAmount ?? 0) : burn.totalHours;
  const contractorPlanned = isAmount
    ? burn.contractorAmount
    : burn.contractorHours;
  const internalUsed = isAmount
    ? burn.usedAmount - burn.contractorUsedAmount
    : burn.usedHours - burn.contractorUsedHours;
  const internalFuture = isAmount
    ? burn.futureAmount - burn.contractorFutureAmount
    : burn.futureHours - burn.contractorFutureHours;
  const hasContractor = contractorPlanned > 0;

  const contractorPct = budget > 0 ? (contractorPlanned / budget) * 100 : 0;
  const usedPct = budget > 0 ? (internalUsed / budget) * 100 : 0;
  const futurePct = budget > 0 ? (internalFuture / budget) * 100 : 0;

  const fillClass = clsx(
    health === "over" && "bg-[var(--status-over)]",
    health === "near" && "bg-[var(--status-near)]",
    (health === "healthy" || health === "none") && "bg-[var(--accent)]",
  );

  const contractorFillClass = clsx(
    health === "over" && "bg-[var(--status-over)]",
    health === "near" && "bg-[var(--status-near)]",
    (health === "healthy" || health === "none") &&
      "bg-[var(--status-healthy)]",
  );

  const hasContractorSeg = contractorPct > 0;
  const hasUsed = usedPct > 0;
  const hasFuture = futurePct > 0;

  const totalUsed = isAmount ? burn.usedAmount : burn.usedHours;
  const totalFuture = isAmount ? burn.futureAmount : burn.futureHours;
  const money = (n: number) =>
    formatMoney(n, currency, settings.currency_enabled);

  return (
    <div className="min-w-0">
      {!compact && (
        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
          <span className="text-[var(--text-muted)]">
            {isAmount
              ? `${money(burn.plannedAmount)} / ${money(burn.totalAmount ?? 0)}`
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
                ? `${money(burn.amountOverBy)} over`
                : `${money(Math.max(0, burn.remainingAmount ?? 0))} left`
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
          totalFuture > 0
            ? isAmount
              ? `${money(totalUsed)} used · ${money(totalFuture)} planned`
              : `${formatHours(totalUsed)} used · ${formatHours(totalFuture)} planned`
            : undefined
        }
      >
        {hasContractorSeg ? (
          <div
            className={clsx(
              "h-full shrink-0",
              contractorFillClass,
              !hasUsed && !hasFuture && "rounded-full",
              hasUsed || hasFuture ? "rounded-l-full" : "",
            )}
            style={{ width: `${contractorPct}%` }}
          />
        ) : null}
        {hasUsed ? (
          <div
            className={clsx(
              "h-full shrink-0",
              fillClass,
              hasFuture
                ? hasContractorSeg
                  ? ""
                  : "rounded-l-full"
                : hasContractorSeg
                  ? "rounded-r-full"
                  : "rounded-full",
            )}
            style={{ width: `${usedPct}%` }}
          />
        ) : null}
        {hasFuture ? (
          <div
            className={clsx(
              "relative h-full min-w-0 shrink-0 overflow-hidden",
              fillClass,
              hasUsed || hasContractorSeg
                ? "rounded-r-full border-l border-[var(--progress-approved-hatch)]"
                : "rounded-full",
            )}
            style={{ width: `${futurePct}%` }}
          >
            <div
              className={clsx(
                "absolute inset-0",
                hasUsed || hasContractorSeg ? "rounded-r-full" : "rounded-full",
              )}
              style={hatchStyle}
              aria-hidden
            />
          </div>
        ) : null}
      </div>
      {hasContractor && !compact ? (
        <p className="mt-1 flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
          <span className="inline-flex items-center gap-1">
            <span
              className={clsx(
                "inline-block h-2 w-2 rounded-full",
                contractorFillClass,
              )}
              aria-hidden
            />
            Contractor
          </span>
          <span className="inline-flex items-center gap-1">
            <span
              className={clsx("inline-block h-2 w-2 rounded-full", fillClass)}
              aria-hidden
            />
            Internal
          </span>
        </p>
      ) : null}
    </div>
  );
}
