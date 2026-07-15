import { endOfMonth, format, startOfMonth } from "date-fns";
import type { Assignment, BudgetBurn, Person, Project } from "@/lib/types";
import { expandAssignmentInRange } from "@/lib/domain/recurrence";
import { assignmentHoursWithRecurrence } from "@/lib/domain/recurrence";
import { toDateKey, workingDaysBetween } from "@/lib/domain/dates";

export function normalizeBudgetMode(
  mode: string | null | undefined,
  hours: number | null | undefined,
  amount: number | null | undefined,
): Project["budget_mode"] {
  if (mode === "none" || mode === "hours" || mode === "amount") return mode;
  // Legacy "both": prefer hours, otherwise amount, otherwise none.
  if (mode === "both") {
    if ((hours ?? 0) > 0) return "hours";
    if (amount != null && amount > 0) return "amount";
    return "none";
  }
  if ((hours ?? 0) > 0) return "hours";
  if (amount != null && amount > 0) return "amount";
  return "none";
}

export function assignmentHours(assignment: Assignment): number {
  return assignmentHoursWithRecurrence(assignment);
}

/** Hours overlapping a calendar month (inclusive), respecting recurrence expansion. */
export function assignmentHoursInMonth(
  assignment: Assignment,
  year: number,
  monthIndex: number,
): number {
  const monthStart = startOfMonth(new Date(year, monthIndex, 1));
  const monthEnd = endOfMonth(monthStart);
  const startKey = toDateKey(monthStart);
  const endKey = toDateKey(monthEnd);
  return expandAssignmentInRange(assignment, startKey, endKey).reduce(
    (sum, occ) => {
      const days = workingDaysBetween(occ.start_date, occ.end_date).filter(
        (d) => d >= startKey && d <= endKey,
      );
      return sum + days.length * occ.hours_per_day;
    },
    0,
  );
}

export function projectPlannedHours(
  projectId: string,
  assignments: Assignment[],
  includeTentative = false,
  opts?: { year: number; monthIndex: number },
): number {
  return assignments
    .filter(
      (a) =>
        a.project_id === projectId &&
        (includeTentative || a.status === "confirmed"),
    )
    .reduce((sum, a) => {
      if (opts) {
        return sum + assignmentHoursInMonth(a, opts.year, opts.monthIndex);
      }
      return sum + assignmentHours(a);
    }, 0);
}

export function projectPlannedAmount(
  projectId: string,
  assignments: Assignment[],
  people: Person[],
  includeTentative = false,
  opts?: { year: number; monthIndex: number },
): number {
  const byId = new Map(people.map((p) => [p.id, p]));
  return assignments
    .filter(
      (a) =>
        a.project_id === projectId &&
        (includeTentative || a.status === "confirmed"),
    )
    .reduce((sum, a) => {
      const person = byId.get(a.person_id);
      const rate = person?.bill_rate ?? 0;
      const hours = opts
        ? assignmentHoursInMonth(a, opts.year, opts.monthIndex)
        : assignmentHours(a);
      return sum + hours * rate;
    }, 0);
}

/**
 * Budget burn uses exactly one ledger based on budget_mode:
 * - none: no tracking (pct stays 0)
 * - hours: planned hours vs budget_hours (+ optional monthly reset)
 * - amount: planned $ (hours × person bill_rate) vs budget_amount
 * Hourly and dollar are mutually exclusive — never both.
 */
export function budgetBurn(
  project: Project,
  assignments: Assignment[],
  people: Person[],
  includeTentative = false,
  asOf: Date = new Date(),
): BudgetBurn {
  const mode = normalizeBudgetMode(
    project.budget_mode,
    project.budget_hours,
    project.budget_amount,
  );
  const monthOpts =
    mode === "hours" && project.budget_monthly_reset
      ? { year: asOf.getFullYear(), monthIndex: asOf.getMonth() }
      : undefined;

  const plannedHours = projectPlannedHours(
    project.id,
    assignments,
    includeTentative,
    monthOpts,
  );
  const plannedAmount = projectPlannedAmount(
    project.id,
    assignments,
    people,
    includeTentative,
    monthOpts,
  );

  if (mode === "none") {
    return {
      totalHours: 0,
      plannedHours,
      remainingHours: 0,
      pct: 0,
      overBy: 0,
      totalAmount: null,
      plannedAmount,
      remainingAmount: null,
      amountOverBy: 0,
      mode: "none",
    };
  }

  if (mode === "amount") {
    const totalAmount = project.budget_amount ?? 0;
    const remainingAmount = totalAmount - plannedAmount;
    return {
      totalHours: 0,
      plannedHours,
      remainingHours: 0,
      pct:
        totalAmount <= 0
          ? 0
          : Math.min(999, (plannedAmount / totalAmount) * 100),
      overBy: 0,
      totalAmount,
      plannedAmount,
      remainingAmount,
      amountOverBy: Math.max(0, plannedAmount - totalAmount),
      mode: "amount",
    };
  }

  const totalHours = project.budget_hours ?? 0;
  const remainingHours = totalHours - plannedHours;
  return {
    totalHours,
    plannedHours,
    remainingHours,
    pct: totalHours <= 0 ? 0 : Math.min(999, (plannedHours / totalHours) * 100),
    overBy: Math.max(0, plannedHours - totalHours),
    totalAmount: null,
    plannedAmount,
    remainingAmount: null,
    amountOverBy: 0,
    mode: "hours",
  };
}

export function budgetHealth(
  burn: BudgetBurn,
): "healthy" | "near" | "over" | "none" {
  if (burn.mode === "none") return "none";
  if (burn.mode === "amount") {
    if (burn.amountOverBy > 0) return "over";
    if (burn.pct >= 85) return "near";
    return "healthy";
  }
  if (burn.overBy > 0) return "over";
  if (burn.pct >= 85) return "near";
  return "healthy";
}

export function formatHours(hours: number): string {
  const rounded = Math.round(hours * 100) / 100;
  if (Number.isInteger(rounded)) return `${rounded}h`;
  return `${parseFloat(rounded.toFixed(2))}h`;
}

/** Clamp assignment hours to two decimal places (e.g. 0.25). */
export function roundAssignmentHours(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  return Math.round(hours * 100) / 100;
}

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export interface MonthBurnBar {
  key: string;
  label: string;
  year: number;
  monthIndex: number;
  plannedHours: number;
  budgetHours: number;
  pct: number;
}

/** Last N months of hourly burn for monthly-reset (retainer) projects. */
export function monthlyHourBars(
  project: Project,
  assignments: Assignment[],
  months = 6,
  asOf: Date = new Date(),
): MonthBurnBar[] {
  const budgetHours = project.budget_hours ?? 0;
  const out: MonthBurnBar[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(asOf.getFullYear(), asOf.getMonth() - i, 1);
    const year = d.getFullYear();
    const monthIndex = d.getMonth();
    const plannedHours = projectPlannedHours(project.id, assignments, false, {
      year,
      monthIndex,
    });
    out.push({
      key: format(d, "yyyy-MM"),
      label: format(d, "MMM yyyy"),
      year,
      monthIndex,
      plannedHours,
      budgetHours,
      pct:
        budgetHours <= 0
          ? 0
          : Math.min(999, (plannedHours / budgetHours) * 100),
    });
  }
  return out;
}

/** Jan–Dec of the given calendar year (defaults to current year). */
export function calendarYearHourBars(
  project: Project,
  assignments: Assignment[],
  asOf: Date = new Date(),
): MonthBurnBar[] {
  const year = asOf.getFullYear();
  const budgetHours = project.budget_hours ?? 0;
  const out: MonthBurnBar[] = [];
  for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
    const d = new Date(year, monthIndex, 1);
    const plannedHours = projectPlannedHours(project.id, assignments, false, {
      year,
      monthIndex,
    });
    out.push({
      key: format(d, "yyyy-MM"),
      label: format(d, "MMM yyyy"),
      year,
      monthIndex,
      plannedHours,
      budgetHours,
      pct:
        budgetHours <= 0
          ? 0
          : Math.min(999, (plannedHours / budgetHours) * 100),
    });
  }
  return out;
}
