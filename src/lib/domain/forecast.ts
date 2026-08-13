import type {
  Assignment,
  OrganizationSettings,
  Person,
  Project,
} from "@/lib/types";
import {
  assignmentHours,
  normalizeBudgetMode,
  projectHoursForecast,
  projectPlannedAmount,
} from "@/lib/domain/budget";
import {
  DEFAULT_ORG_BUDGET_SETTINGS,
  effectiveCostRate,
  effectiveProjectBillRate,
} from "@/lib/domain/org-settings";

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
  settings: OrganizationSettings = DEFAULT_ORG_BUDGET_SETTINGS,
): ProjectForecast {
  const byId = new Map(people.map((p) => [p.id, p]));
  let plannedHours = 0;
  let revenue = 0;
  let cost = 0;
  const billRate = effectiveProjectBillRate(project, settings);

  for (const a of assignments) {
    if (a.project_id !== project.id || a.status !== "confirmed") continue;
    const hours = assignmentHours(a);
    const person = byId.get(a.person_id);
    plannedHours += hours;
    revenue += hours * billRate;
    cost += hours * effectiveCostRate(person, settings);
  }

  const margin = revenue - cost;
  const hoursFx = projectHoursForecast(
    project,
    assignments,
    people,
    asOf,
    settings,
  );
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
    const avgCost = plannedHours > 0 ? cost / plannedHours : 0;
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

/** Re-export for callers that only need the hours split. */
export { projectHoursForecast, projectPlannedAmount };
