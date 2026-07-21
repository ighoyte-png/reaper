import type { Assignment, Person, Project } from "@/lib/types";
import {
  assignmentHours,
  normalizeBudgetMode,
  projectHoursForecast,
  projectPlannedAmount,
} from "@/lib/domain/budget";

export interface ProjectForecast {
  projectId: string;
  plannedHours: number;
  revenue: number;
  cost: number;
  margin: number;
  marginPct: number;
  /** Hours used ≤ today (schedule-based). */
  hoursUsedToDate: number;
  hoursFuturePlanned: number;
  hoursRemaining: number | null;
  /** Projected total cost vs budget $ (amount mode) or cost of hours vs hours×avg. */
  budgetMargin: number | null;
  budgetMarginPct: number | null;
  overBudget: boolean;
}

export function projectForecast(
  project: Project,
  assignments: Assignment[],
  people: Person[],
  asOf: Date = new Date(),
): ProjectForecast {
  const byId = new Map(people.map((p) => [p.id, p]));
  let plannedHours = 0;
  let revenue = 0;
  let cost = 0;

  for (const a of assignments) {
    if (a.project_id !== project.id || a.status !== "confirmed") continue;
    const hours = assignmentHours(a);
    const person = byId.get(a.person_id);
    plannedHours += hours;
    revenue += hours * (person?.bill_rate ?? 0);
    cost += hours * (person?.cost_rate ?? 0);
  }

  const margin = revenue - cost;
  const hoursFx = projectHoursForecast(project, assignments, people, asOf);
  const mode = normalizeBudgetMode(
    project.budget_mode,
    project.budget_hours,
    project.budget_amount,
  );

  let budgetMargin: number | null = null;
  let budgetMarginPct: number | null = null;
  if (mode === "amount") {
    const totalAmount = project.budget_amount ?? 0;
    budgetMargin = totalAmount - cost;
    budgetMarginPct =
      totalAmount <= 0 ? null : (budgetMargin / totalAmount) * 100;
  } else if (mode === "hours") {
    const totalHours = project.budget_hours ?? 0;
    // Margin vs budget: unused budget hours valued at blended cost rate.
    const avgCost =
      plannedHours > 0 ? cost / plannedHours : 0;
    const unusedHours = totalHours - hoursFx.hoursTotalPlanned;
    budgetMargin = unusedHours * avgCost;
    budgetMarginPct =
      totalHours <= 0
        ? null
        : ((totalHours - hoursFx.hoursTotalPlanned) / totalHours) * 100;
  }

  return {
    projectId: project.id,
    plannedHours,
    revenue,
    cost,
    margin,
    marginPct: revenue <= 0 ? 0 : (margin / revenue) * 100,
    hoursUsedToDate: hoursFx.hoursUsedToDate,
    hoursFuturePlanned: hoursFx.hoursFuturePlanned,
    hoursRemaining: hoursFx.hoursRemaining,
    budgetMargin,
    budgetMarginPct,
    overBudget: hoursFx.overBudget,
  };
}

export function orgForecast(
  projects: Project[],
  assignments: Assignment[],
  people: Person[],
): ProjectForecast {
  const parts = projects.map((p) => projectForecast(p, assignments, people));
  const revenue = parts.reduce((s, p) => s + p.revenue, 0);
  const cost = parts.reduce((s, p) => s + p.cost, 0);
  const margin = revenue - cost;
  return {
    projectId: "org",
    plannedHours: parts.reduce((s, p) => s + p.plannedHours, 0),
    revenue,
    cost,
    margin,
    marginPct: revenue <= 0 ? 0 : (margin / revenue) * 100,
    hoursUsedToDate: parts.reduce((s, p) => s + p.hoursUsedToDate, 0),
    hoursFuturePlanned: parts.reduce((s, p) => s + p.hoursFuturePlanned, 0),
    hoursRemaining: parts.reduce(
      (s, p) => s + (p.hoursRemaining ?? 0),
      0,
    ),
    budgetMargin: parts.reduce((s, p) => s + (p.budgetMargin ?? 0), 0),
    budgetMarginPct: null,
    overBudget: parts.some((p) => p.overBudget),
  };
}

/** Re-export for callers that only need the hours split. */
export { projectHoursForecast, projectPlannedAmount };
