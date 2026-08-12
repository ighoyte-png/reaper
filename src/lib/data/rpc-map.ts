import { format } from "date-fns";
import type { MonthBurnBar } from "@/lib/domain/budget";
import {
  isMonthlyRetainerBudget,
  normalizeBudgetMode,
} from "@/lib/domain/budget";
import type { BudgetBurn, Project } from "@/lib/types";
import type {
  MonthlyRetainerYearBarRow,
  ProjectBudgetBurnRow,
} from "@/lib/supabase/api";

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

/** Build 12 MonthBurnBar rows for a monthly-hours project from RPC rows. */
export function monthlyYearBarsFromRpcRows(
  project: Project,
  year: number,
  rows: MonthlyRetainerYearBarRow[],
): MonthBurnBar[] {
  const mode = normalizeBudgetMode(
    project.budget_mode,
    project.budget_hours,
    project.budget_amount,
  );
  const monthlyCap = isMonthlyRetainerBudget(project)
    ? mode === "amount"
      ? project.budget_amount ?? 0
      : project.budget_hours ?? 0
    : 0;
  const byMonth = new Map(
    rows
      .filter((r) => r.project_id === project.id)
      .map((r) => [r.month_index, r]),
  );

  const out: MonthBurnBar[] = [];
  for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
    const d = new Date(year, monthIndex, 1);
    const row = byMonth.get(monthIndex);
    const usedHours = row?.used_hours ?? 0;
    const futureHours = row?.future_hours ?? 0;
    const usedAmount = row?.used_amount ?? 0;
    const futureAmount = row?.future_amount ?? 0;
    const contractorUsedHours = row?.contractor_used_hours ?? 0;
    const contractorFutureHours = row?.contractor_future_hours ?? 0;
    const contractorUsedAmount = row?.contractor_used_amount ?? 0;
    const contractorFutureAmount = row?.contractor_future_amount ?? 0;
    const contractorHours = contractorUsedHours + contractorFutureHours;
    const contractorAmount = contractorUsedAmount + contractorFutureAmount;
    const plannedHours = usedHours + futureHours + contractorHours;
    const plannedAmount = usedAmount + futureAmount + contractorAmount;
    const value = mode === "amount" ? plannedAmount : plannedHours;
    const cap = monthlyCap;
    out.push({
      key: format(d, "yyyy-MM"),
      label: format(d, "MMM yyyy"),
      year,
      monthIndex,
      plannedHours,
      plannedAmount,
      usedHours,
      futureHours,
      usedAmount,
      futureAmount,
      contractorHours,
      contractorAmount,
      contractorUsedHours,
      contractorFutureHours,
      contractorUsedAmount,
      contractorFutureAmount,
      value,
      cap,
      budgetHours: mode === "hours" ? monthlyCap : 0,
      pct: cap <= 0 ? 0 : Math.min(999, (value / cap) * 100),
    });
  }
  return out;
}
