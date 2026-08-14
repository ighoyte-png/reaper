import type {
  Assignment,
  OrganizationSettings,
  Person,
  Project,
  ProjectContractorExpense,
  ProjectMember,
} from "@/lib/types";
import {
  assignmentHours,
  contractorExpenseTotalsInRange,
  hoursCommitmentTotalInRange,
  isMonthlyRetainerBudget,
  normalizeBudgetMode,
  personHoursSplitInRange,
  projectHoursForecast,
  projectPlannedAmount,
} from "@/lib/domain/budget";
import {
  contractorCommitted,
  isProjectBasisContractor,
} from "@/lib/domain/contractor";
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

export interface PeriodEconomics {
  revenue: number;
  cost: number;
  scheduleCost: number;
  expenseCost: number;
  contractorCost: number;
  contractorHours: number;
  contractorRevenue: number;
  scheduleHours: number;
}

function isCommitContractor(
  person: Person,
  member: Pick<ProjectMember, "contractor_mode"> | null | undefined,
): boolean {
  if (!isProjectBasisContractor(person)) return false;
  const mode =
    member?.contractor_mode ??
    (person.hide_from_schedule ? "fixed_fee" : "scheduled");
  return mode === "fixed_fee" || mode === "hours";
}

/**
 * Revenue / cost for a date window. Hours mode marks contractor time up to
 * the project bill rate; amount mode treats contractors as cost only.
 */
export function projectPeriodEconomics(
  project: Project,
  assignments: Assignment[],
  people: Person[],
  members: ProjectMember[],
  expenses: ProjectContractorExpense[],
  rangeStart: string,
  rangeEnd: string,
  settings: OrganizationSettings = DEFAULT_ORG_BUDGET_SETTINGS,
  asOf: Date = new Date(),
): PeriodEconomics {
  const byId = new Map(people.map((p) => [p.id, p]));
  const membersByPerson = new Map(
    members
      .filter((m) => m.project_id === project.id)
      .map((m) => [m.person_id, m] as const),
  );
  const billRate = effectiveProjectBillRate(project, settings);
  const monthly = isMonthlyRetainerBudget(project);
  const mode = normalizeBudgetMode(
    project.budget_mode,
    project.budget_hours,
    project.budget_amount,
  );

  const personIds = new Set<string>();
  for (const a of assignments) {
    if (a.project_id !== project.id || a.status !== "confirmed") continue;
    personIds.add(a.person_id);
  }
  for (const m of membersByPerson.keys()) personIds.add(m);

  let scheduleHours = 0;
  let scheduleCost = 0;
  for (const personId of personIds) {
    const person = byId.get(personId);
    if (!person) continue;
    if (isCommitContractor(person, membersByPerson.get(personId))) continue;
    const split = personHoursSplitInRange(
      personId,
      project.id,
      assignments,
      rangeStart,
      rangeEnd,
    );
    const hours = split.usedHours + split.futureHours;
    scheduleHours += hours;
    scheduleCost += hours * effectiveCostRate(person, settings);
  }

  let contractorHours = 0;
  let contractorCost = 0;
  if (monthly) {
    const expense = contractorExpenseTotalsInRange(
      project.id,
      expenses,
      people,
      rangeStart,
      rangeEnd,
      project,
    );
    contractorHours += expense.hours;
    contractorCost += expense.amount;
    for (const personId of personIds) {
      const person = byId.get(personId);
      if (!person) continue;
      const member = membersByPerson.get(personId);
      if (!isCommitContractor(person, member)) continue;
      if ((member?.contractor_mode ?? "") !== "hours") continue;
      const leftover = member?.contractor_hours ?? 0;
      if (leftover <= 0) continue;
      const leftoverHours = hoursCommitmentTotalInRange(
        project,
        leftover,
        rangeStart,
        rangeEnd,
        asOf,
      );
      contractorHours += leftoverHours;
      contractorCost +=
        leftoverHours * effectiveCostRate(person, settings);
    }
  } else {
    for (const personId of personIds) {
      const person = byId.get(personId);
      if (!person) continue;
      const member = membersByPerson.get(personId);
      if (!isCommitContractor(person, member)) continue;
      const committed = contractorCommitted(person, member, { settings });
      contractorHours += committed.hours;
      contractorCost += committed.amount;
    }
  }

  const contractorRevenue =
    mode === "hours" ? contractorHours * billRate : 0;
  const scheduleRevenue = mode === "hours" ? scheduleHours * billRate : 0;

  return {
    revenue: scheduleRevenue + contractorRevenue,
    cost: scheduleCost + contractorCost,
    scheduleCost,
    expenseCost: monthly ? contractorCost : 0,
    contractorCost,
    contractorHours,
    contractorRevenue,
    scheduleHours,
  };
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
