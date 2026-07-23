import type { BudgetBurn } from "@/lib/types";
import type {
  OrgForecastRow,
  ProjectBudgetBurnRow,
} from "@/lib/supabase/api";
import type { ProjectForecast } from "@/lib/domain/forecast";

export function burnFromRpcRow(row: ProjectBudgetBurnRow): BudgetBurn {
  return {
    totalHours: row.total_hours,
    plannedHours: row.planned_hours,
    usedHours: row.used_hours,
    futureHours: row.future_hours,
    remainingHours: row.remaining_hours,
    pct: row.pct,
    overBy: row.over_by,
    totalAmount: row.total_amount,
    plannedAmount: row.planned_amount,
    usedAmount: row.used_amount,
    futureAmount: row.future_amount,
    remainingAmount: row.remaining_amount,
    amountOverBy: row.amount_over_by,
    mode: row.mode,
  };
}

export function forecastFromRpcRow(row: OrgForecastRow): ProjectForecast {
  return {
    projectId: row.project_id ?? "org",
    plannedHours: row.planned_hours,
    revenue: row.revenue,
    cost: row.cost,
    margin: row.margin,
    marginPct: row.margin_pct,
    hoursUsedToDate: row.hours_used_to_date,
    hoursFuturePlanned: row.hours_future_planned,
    hoursRemaining: row.hours_remaining,
    budgetMargin: row.budget_margin,
    budgetMarginPct: row.budget_margin_pct,
    overBudget: row.over_budget,
  };
}
