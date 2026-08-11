import type { BudgetBurn } from "@/lib/types";
import type { ProjectBudgetBurnRow } from "@/lib/supabase/api";

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
    contractorHours: row.contractor_hours,
    contractorAmount: row.contractor_amount,
    contractorUsedHours: row.contractor_used_hours,
    contractorFutureHours: row.contractor_future_hours,
    contractorUsedAmount: row.contractor_used_amount,
    contractorFutureAmount: row.contractor_future_amount,
  };
}
