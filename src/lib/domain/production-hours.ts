import { endOfMonth, startOfMonth } from "date-fns";
import type {
  Assignment,
  OrganizationSettings,
  Person,
  Project,
  ProjectContractorExpense,
  ProjectMember,
} from "@/lib/types";
import {
  contractorExpenseTotalsInRange,
  hoursCommitmentTotalInRange,
  isMonthlyRetainerBudget,
  normalizeBudgetMode,
  personHoursSplitInRange,
  spendHealth,
} from "@/lib/domain/budget";
import {
  contractorCommitted,
  isCommitContractor,
} from "@/lib/domain/contractor";
import {
  DEFAULT_ORG_BUDGET_SETTINGS,
  effectiveCostRate,
  targetCostPct,
} from "@/lib/domain/org-settings";
import { toDateKey } from "@/lib/domain/dates";

export type ProductionHoursHealth = "healthy" | "near" | "over" | "none";

export interface ProductionHoursEstimate {
  avgCostRate: number;
  fee: number;
  contractorAmount: number;
  contractorHoursEquiv: number;
  breakEvenHours: number;
  targetMarginHours: number;
  usedHours: number;
  futureHours: number;
  remainingTargetHours: number;
  remainingBreakEvenHours: number;
  health: ProductionHoursHealth;
  emptyTeam: boolean;
  marginPct: number;
}

/**
 * Fixed-fee production hours guide: fee ÷ avg team cost, adjusted for org
 * target margin and contractor commits. Null when not amount mode.
 */
export function productionHoursEstimate(
  project: Project,
  assignments: Assignment[],
  people: Person[],
  members: ProjectMember[],
  expenses: ProjectContractorExpense[],
  settings: OrganizationSettings = DEFAULT_ORG_BUDGET_SETTINGS,
  asOf: Date = new Date(),
): ProductionHoursEstimate | null {
  const mode = normalizeBudgetMode(
    project.budget_mode,
    project.budget_hours,
    project.budget_amount,
  );
  if (mode !== "amount") return null;

  const byId = new Map(people.map((p) => [p.id, p]));
  const membersByPerson = new Map(
    members
      .filter((m) => m.project_id === project.id)
      .map((m) => [m.person_id, m] as const),
  );

  const rosterIds = new Set<string>();
  for (const m of membersByPerson.keys()) rosterIds.add(m);
  for (const a of assignments) {
    if (a.project_id !== project.id || a.status !== "confirmed") continue;
    rosterIds.add(a.person_id);
  }

  const teamRatePeople: Person[] = [];
  for (const personId of rosterIds) {
    const person = byId.get(personId);
    if (!person || person.deleted_at) continue;
    if (isCommitContractor(person, membersByPerson.get(personId))) continue;
    teamRatePeople.push(person);
  }

  const emptyTeam = teamRatePeople.length === 0;
  const marginPct = settings.target_profit_margin_pct;
  const fee = project.budget_amount ?? 0;

  if (emptyTeam) {
    return {
      avgCostRate: 0,
      fee,
      contractorAmount: 0,
      contractorHoursEquiv: 0,
      breakEvenHours: 0,
      targetMarginHours: 0,
      usedHours: 0,
      futureHours: 0,
      remainingTargetHours: 0,
      remainingBreakEvenHours: 0,
      health: "none",
      emptyTeam: true,
      marginPct,
    };
  }

  const avgCostRate =
    teamRatePeople.reduce(
      (sum, p) => sum + effectiveCostRate(p, settings),
      0,
    ) / teamRatePeople.length;

  const monthly = isMonthlyRetainerBudget(project);
  let rangeStart = "1970-01-01";
  let rangeEnd = "2099-12-31";
  if (monthly) {
    rangeStart = toDateKey(startOfMonth(asOf));
    rangeEnd = toDateKey(endOfMonth(asOf));
  }

  let contractorAmount = 0;
  let contractorHoursEquiv = 0;
  if (monthly) {
    const expense = contractorExpenseTotalsInRange(
      project.id,
      expenses,
      people,
      rangeStart,
      rangeEnd,
      project,
    );
    contractorAmount += expense.amount;
    contractorHoursEquiv += expense.hours;
    for (const personId of rosterIds) {
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
      contractorHoursEquiv += leftoverHours;
      contractorAmount += leftoverHours * effectiveCostRate(person, settings);
    }
  } else {
    for (const personId of rosterIds) {
      const person = byId.get(personId);
      if (!person) continue;
      const member = membersByPerson.get(personId);
      if (!isCommitContractor(person, member)) continue;
      const committed = contractorCommitted(person, member, { settings });
      contractorAmount += committed.amount;
      contractorHoursEquiv += committed.hours;
    }
  }

  const internalFeePool = Math.max(0, fee - contractorAmount);
  const breakEvenHours =
    avgCostRate > 0 ? internalFeePool / avgCostRate : 0;
  const targetMarginHours =
    avgCostRate > 0
      ? (internalFeePool * (targetCostPct(settings) / 100)) / avgCostRate
      : 0;

  let usedHours = 0;
  let futureHours = 0;
  for (const personId of rosterIds) {
    const person = byId.get(personId);
    if (!person) continue;
    if (isCommitContractor(person, membersByPerson.get(personId))) continue;
    const split = personHoursSplitInRange(
      personId,
      project.id,
      assignments,
      rangeStart,
      rangeEnd,
      asOf,
    );
    usedHours += split.usedHours;
    futureHours += split.futureHours;
  }

  const plannedInternal = usedHours + futureHours;
  const remainingTargetHours = targetMarginHours - plannedInternal;
  const remainingBreakEvenHours = breakEvenHours - plannedInternal;
  const health = spendHealth(
    "amount",
    plannedInternal,
    targetMarginHours,
    settings,
  );

  return {
    avgCostRate,
    fee,
    contractorAmount,
    contractorHoursEquiv,
    breakEvenHours,
    targetMarginHours,
    usedHours,
    futureHours,
    remainingTargetHours,
    remainingBreakEvenHours,
    health,
    emptyTeam: false,
    marginPct,
  };
}
