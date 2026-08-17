import type { OrganizationSettings, Project } from "@/lib/types";

/** Spec defaults. Amount warning matches target cost % (25% margin → 75). Existing DB rows may still store 76 until Target Profit Margin is re-saved. */
export const DEFAULT_ORG_BUDGET_SETTINGS: OrganizationSettings = {
  organization_id: "",
  default_cost_rate: 50,
  default_bill_rate: 150,
  hours_warning_pct: 90,
  hours_over_pct: 100,
  target_profit_margin_pct: 25,
  amount_warning_pct: 75,
  amount_over_pct: 100,
  capacity_low_max_pct: 60,
  capacity_near_pct: 85,
  capacity_over_pct: 100,
};

export function normalizeOrgBudgetSettings(
  partial: Partial<OrganizationSettings> | null | undefined,
  organizationId = "",
): OrganizationSettings {
  const d = DEFAULT_ORG_BUDGET_SETTINGS;
  return {
    organization_id: partial?.organization_id || organizationId || d.organization_id,
    default_cost_rate: numOr(partial?.default_cost_rate, d.default_cost_rate),
    default_bill_rate: numOr(partial?.default_bill_rate, d.default_bill_rate),
    hours_warning_pct: numOr(partial?.hours_warning_pct, d.hours_warning_pct),
    hours_over_pct: numOr(partial?.hours_over_pct, d.hours_over_pct),
    target_profit_margin_pct: numOr(
      partial?.target_profit_margin_pct,
      d.target_profit_margin_pct,
    ),
    amount_warning_pct: numOr(partial?.amount_warning_pct, d.amount_warning_pct),
    amount_over_pct: numOr(partial?.amount_over_pct, d.amount_over_pct),
    capacity_low_max_pct: numOr(
      partial?.capacity_low_max_pct,
      d.capacity_low_max_pct,
    ),
    capacity_near_pct: numOr(partial?.capacity_near_pct, d.capacity_near_pct),
    capacity_over_pct: numOr(partial?.capacity_over_pct, d.capacity_over_pct),
  };
}

function numOr(v: number | null | undefined, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Person cost with org default when missing/zero. */
export function effectiveCostRate(
  person: { cost_rate?: number | null } | null | undefined,
  settings: Pick<OrganizationSettings, "default_cost_rate"> = DEFAULT_ORG_BUDGET_SETTINGS,
): number {
  const rate = person?.cost_rate ?? 0;
  if (rate > 0) return rate;
  return settings.default_cost_rate > 0 ? settings.default_cost_rate : 0;
}

/** Project bill rate (hours/T&M) with org default when missing/zero. */
export function effectiveProjectBillRate(
  project: Pick<Project, "bill_rate" | "budget_mode"> | null | undefined,
  settings: Pick<OrganizationSettings, "default_bill_rate"> = DEFAULT_ORG_BUDGET_SETTINGS,
): number {
  const rate = project?.bill_rate ?? 0;
  if (rate > 0) return rate;
  return settings.default_bill_rate > 0 ? settings.default_bill_rate : 0;
}

/** Target cost share of fixed fee (e.g. 75% when margin is 25%). */
export function targetCostPct(
  settings: Pick<OrganizationSettings, "target_profit_margin_pct">,
): number {
  const margin = Math.min(99, Math.max(0, settings.target_profit_margin_pct));
  return 100 - margin;
}

/** Remaining $ allowed under target cost before margin is fully eroded. */
export function remainingTargetCostAllowance(
  fee: number,
  costBurned: number,
  settings: Pick<OrganizationSettings, "target_profit_margin_pct">,
): number {
  const allowance = fee * (targetCostPct(settings) / 100);
  return allowance - costBurned;
}

/**
 * Validate threshold ordering for Admin UI.
 * Blue ends just before warning; orange is [warning, over); red is ≥ over
 * (hours: over when planned > cap, i.e. pct > over_pct typically 100).
 */
export function validateBudgetThresholds(opts: {
  warningPct: number;
  overPct: number;
}): string | null {
  const { warningPct, overPct } = opts;
  if (!(warningPct >= 0 && overPct > warningPct)) {
    return "Warning must be ≥ 0 and less than Over.";
  }
  if (overPct > 200) return "Over threshold is too high.";
  return null;
}

export function syncAmountWarningFromMargin(
  targetProfitMarginPct: number,
): number {
  const healthyMax = targetCostPct({
    target_profit_margin_pct: targetProfitMarginPct,
  });
  // Orange starts at the target cost % (exact ≥ warning). 25% margin → 75.
  return Math.min(99, Math.max(0, healthyMax));
}

/** Breakpoints for capacityLevel() from org Admin settings. */
export function capacityThresholdsFromSettings(
  settings: Pick<
    OrganizationSettings,
    "capacity_low_max_pct" | "capacity_near_pct" | "capacity_over_pct"
  > = DEFAULT_ORG_BUDGET_SETTINGS,
) {
  return {
    lowMaxPct: settings.capacity_low_max_pct,
    nearPct: settings.capacity_near_pct,
    overPct: settings.capacity_over_pct,
  };
}

/** Utilization heatmap legend ranges derived from Admin capacity thresholds. */
export function capacityLegendItems(
  thresholds: ReturnType<typeof capacityThresholdsFromSettings> = capacityThresholdsFromSettings(),
): {
  level: "over" | "near" | "healthy" | "low";
  range: string;
  label: string;
}[] {
  const lowMax = Math.round(thresholds.lowMaxPct);
  const near = Math.round(thresholds.nearPct);
  const over = Math.round(thresholds.overPct);
  const healthyEnd = Math.max(lowMax, near - 1);
  const nearEnd = Math.max(near, over - 1);
  return [
    { level: "over", range: `${over}%+`, label: "Overbooked" },
    {
      level: "near",
      range: nearEnd > near ? `${near}-${nearEnd}%` : `${near}%`,
      label: "Near Capacity",
    },
    {
      level: "healthy",
      range:
        healthyEnd > lowMax ? `${lowMax}-${healthyEnd}%` : `${lowMax}%`,
      label: "Optimal",
    },
    { level: "low", range: `<${lowMax}%`, label: "Underutilized" },
  ];
}
