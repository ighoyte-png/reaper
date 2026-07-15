import type { Assignment, BudgetBurn, Person, Project } from "@/lib/types";
import { assignmentHoursWithRecurrence } from "@/lib/domain/recurrence";

export function assignmentHours(assignment: Assignment): number {
  return assignmentHoursWithRecurrence(assignment);
}

export function projectPlannedHours(
  projectId: string,
  assignments: Assignment[],
  includeTentative = false,
): number {
  return assignments
    .filter(
      (a) =>
        a.project_id === projectId &&
        (includeTentative || a.status === "confirmed"),
    )
    .reduce((sum, a) => sum + assignmentHours(a), 0);
}

export function projectPlannedAmount(
  projectId: string,
  assignments: Assignment[],
  people: Person[],
  includeTentative = false,
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
      return sum + assignmentHours(a) * rate;
    }, 0);
}

export function budgetBurn(
  project: Project,
  assignments: Assignment[],
  people: Person[],
  includeTentative = false,
): BudgetBurn {
  const plannedHours = projectPlannedHours(
    project.id,
    assignments,
    includeTentative,
  );
  const totalHours = project.budget_hours;
  const remainingHours = totalHours - plannedHours;
  const plannedAmount = projectPlannedAmount(
    project.id,
    assignments,
    people,
    includeTentative,
  );
  const totalAmount = project.budget_amount;
  const remainingAmount =
    totalAmount == null ? null : totalAmount - plannedAmount;

  return {
    totalHours,
    plannedHours,
    remainingHours,
    pct: totalHours <= 0 ? 0 : Math.min(999, (plannedHours / totalHours) * 100),
    overBy: Math.max(0, plannedHours - totalHours),
    totalAmount,
    plannedAmount,
    remainingAmount,
    amountOverBy:
      totalAmount == null ? 0 : Math.max(0, plannedAmount - totalAmount),
  };
}

export function budgetHealth(
  burn: BudgetBurn,
): "healthy" | "near" | "over" {
  if (burn.overBy > 0 || burn.amountOverBy > 0) return "over";
  if (burn.pct >= 85) return "near";
  return "healthy";
}

export function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}h` : `${rounded.toFixed(1)}h`;
}

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}
