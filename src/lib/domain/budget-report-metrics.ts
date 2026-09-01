import {
  budgetBurn,
  isMonthlyRetainerBudget,
  monthBurnSplit,
  normalizeBudgetMode,
  projectHoursForecast,
} from "@/lib/domain/budget";
import { projectPeriodEconomics } from "@/lib/domain/forecast";
import { DEFAULT_ORG_BUDGET_SETTINGS } from "@/lib/domain/org-settings";
import type {
  Assignment,
  BudgetBurn,
  OrganizationSettings,
  Person,
  Project,
  ProjectContractorExpense,
  ProjectMember,
} from "@/lib/types";

export type BudgetReportPeriodMode = "todate" | "lifetime" | "month" | "term";

export type MonthBurnSplit = ReturnType<typeof monthBurnSplit>;

export interface ProjectBudgetReportMetrics {
  /** Burn for the top Budget Burn card (current month for retainers). */
  burn: BudgetBurn;
  /** Burn aligned to the active forecast period (selected month for retainers). */
  forecastBurn: BudgetBurn;
  monthSplit: MonthBurnSplit | null;
  scheduleUsedHours: number;
  scheduleFutureHours: number;
  scheduleTotalHours: number;
  internalUsedHours: number;
  internalFutureHours: number;
  internalUsedAmount: number;
  internalFutureAmount: number;
  totalUsedHours: number;
  totalFutureHours: number;
  totalUsedAmount: number;
  totalFutureAmount: number;
  totalPlannedHours: number;
  totalPlannedAmount: number;
  remainingHours: number | null;
  remainingAmount: number | null;
  contractorHours: number;
  contractorAmount: number;
}

export function burnInternalFromBurn(burn: BudgetBurn) {
  return {
    usedHours: burn.usedHours - burn.contractorUsedHours,
    futureHours: burn.futureHours - burn.contractorFutureHours,
    usedAmount: burn.usedAmount - burn.contractorUsedAmount,
    futureAmount: burn.futureAmount - burn.contractorFutureAmount,
  };
}

/** Classified month burn as a BudgetBurn-shaped ledger for forecast rows. */
export function budgetBurnForMonth(
  project: Project,
  assignments: Assignment[],
  people: Person[],
  year: number,
  monthIndex: number,
  asOf: Date = new Date(),
  projectMembers: ProjectMember[] = [],
  contractorExpenses: ProjectContractorExpense[] = [],
  settings: OrganizationSettings = DEFAULT_ORG_BUDGET_SETTINGS,
): BudgetBurn {
  const split = monthBurnSplit(
    project,
    assignments,
    people,
    year,
    monthIndex,
    asOf,
    projectMembers,
    contractorExpenses,
    settings,
  );
  const mode = normalizeBudgetMode(
    project.budget_mode,
    project.budget_hours,
    project.budget_amount,
  );
  const usedHours = split.usedHours + split.contractorUsedHours;
  const futureHours = split.futureHours + split.contractorFutureHours;
  const plannedHours = split.plannedHours;
  const usedAmount = split.usedAmount + split.contractorUsedAmount;
  const futureAmount = split.futureAmount + split.contractorFutureAmount;
  const plannedAmount = split.plannedAmount;
  const contractorFields = {
    contractorHours: split.contractorHours,
    contractorAmount: split.contractorAmount,
    contractorUsedHours: split.contractorUsedHours,
    contractorFutureHours: split.contractorFutureHours,
    contractorUsedAmount: split.contractorUsedAmount,
    contractorFutureAmount: split.contractorFutureAmount,
  };

  if (mode === "none") {
    return {
      totalHours: 0,
      plannedHours,
      usedHours,
      futureHours,
      remainingHours: 0,
      pct: 0,
      overBy: 0,
      totalAmount: null,
      plannedAmount,
      usedAmount,
      futureAmount,
      remainingAmount: null,
      amountOverBy: 0,
      mode: "none",
      ...contractorFields,
    };
  }

  if (mode === "amount") {
    const totalAmount = project.budget_amount ?? 0;
    const remainingAmount = totalAmount - plannedAmount;
    return {
      totalHours: 0,
      plannedHours,
      usedHours,
      futureHours,
      remainingHours: 0,
      pct:
        totalAmount <= 0
          ? 0
          : Math.min(999, (plannedAmount / totalAmount) * 100),
      overBy: 0,
      totalAmount,
      plannedAmount,
      usedAmount,
      futureAmount,
      remainingAmount,
      amountOverBy: Math.max(0, plannedAmount - totalAmount),
      mode: "amount",
      ...contractorFields,
    };
  }

  const totalHours = project.budget_hours ?? 0;
  const remainingHours = totalHours - plannedHours;
  return {
    totalHours,
    plannedHours,
    usedHours,
    futureHours,
    remainingHours,
    pct:
      totalHours <= 0 ? 0 : Math.min(999, (plannedHours / totalHours) * 100),
    overBy: Math.max(0, plannedHours - totalHours),
    totalAmount: null,
    plannedAmount,
    usedAmount,
    futureAmount,
    remainingAmount: null,
    amountOverBy: 0,
    mode: "hours",
    ...contractorFields,
  };
}

export function computeProjectBudgetBurn(
  project: Project,
  assignments: Assignment[],
  people: Person[],
  projectMembers: ProjectMember[],
  contractorExpenses: ProjectContractorExpense[],
  settings: OrganizationSettings = DEFAULT_ORG_BUDGET_SETTINGS,
  asOf: Date = new Date(),
): BudgetBurn {
  return budgetBurn(
    project,
    assignments,
    people,
    false,
    asOf,
    projectMembers,
    contractorExpenses,
    settings,
  );
}

export function projectBudgetReportMetrics({
  project,
  assignments,
  people,
  projectMembers,
  contractorExpenses,
  settings = DEFAULT_ORG_BUDGET_SETTINGS,
  asOf = new Date(),
  periodMode,
  selectedMonth,
}: {
  project: Project;
  assignments: Assignment[];
  people: Person[];
  projectMembers: ProjectMember[];
  contractorExpenses: ProjectContractorExpense[];
  settings?: OrganizationSettings;
  asOf?: Date;
  periodMode: BudgetReportPeriodMode;
  selectedMonth?: { year: number; monthIndex: number };
}): ProjectBudgetReportMetrics {
  const burn = computeProjectBudgetBurn(
    project,
    assignments,
    people,
    projectMembers,
    contractorExpenses,
    settings,
    asOf,
  );
  const hoursFx = projectHoursForecast(
    project,
    assignments,
    people,
    asOf,
    settings,
  );
  const isRetainer = isMonthlyRetainerBudget(project);

  let monthSplit: MonthBurnSplit | null = null;
  let forecastBurn = burn;

  if (
    isRetainer &&
    periodMode === "month" &&
    selectedMonth != null
  ) {
    monthSplit = monthBurnSplit(
      project,
      assignments,
      people,
      selectedMonth.year,
      selectedMonth.monthIndex,
      asOf,
      projectMembers,
      contractorExpenses,
      settings,
    );
    forecastBurn = budgetBurnForMonth(
      project,
      assignments,
      people,
      selectedMonth.year,
      selectedMonth.monthIndex,
      asOf,
      projectMembers,
      contractorExpenses,
      settings,
    );
  } else if (isRetainer) {
    forecastBurn = burn;
  }

  const active = isRetainer && periodMode === "month" ? forecastBurn : burn;
  const internal = burnInternalFromBurn(active);

  return {
    burn,
    forecastBurn,
    monthSplit,
    scheduleUsedHours: hoursFx.hoursUsedToDate,
    scheduleFutureHours: hoursFx.hoursFuturePlanned,
    scheduleTotalHours: hoursFx.hoursTotalPlanned,
    internalUsedHours: internal.usedHours,
    internalFutureHours: internal.futureHours,
    internalUsedAmount: internal.usedAmount,
    internalFutureAmount: internal.futureAmount,
    totalUsedHours: active.usedHours,
    totalFutureHours: active.futureHours,
    totalUsedAmount: active.usedAmount,
    totalFutureAmount: active.futureAmount,
    totalPlannedHours: active.plannedHours,
    totalPlannedAmount: active.plannedAmount,
    remainingHours:
      active.mode === "hours" ? active.remainingHours : null,
    remainingAmount:
      active.mode === "amount" ? active.remainingAmount : null,
    contractorHours: active.contractorHours,
    contractorAmount: active.contractorAmount,
  };
}

export function projectBudgetPeriodEconomics(
  project: Project,
  assignments: Assignment[],
  people: Person[],
  projectMembers: ProjectMember[],
  contractorExpenses: ProjectContractorExpense[],
  settings: OrganizationSettings,
  rangeStart: string,
  rangeEnd: string,
  asOf: Date = new Date(),
) {
  return projectPeriodEconomics(
    project,
    assignments,
    people,
    projectMembers,
    contractorExpenses,
    rangeStart,
    rangeEnd,
    settings,
    asOf,
  );
}
