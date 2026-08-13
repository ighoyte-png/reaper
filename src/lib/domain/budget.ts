import { addWeeks, endOfMonth, format, startOfMonth } from "date-fns";
import type {
  Assignment,
  BudgetBurn,
  ContractorMode,
  OrganizationSettings,
  Person,
  Project,
  ProjectContractorExpense,
  ProjectMember,
} from "@/lib/types";
import {
  contractorCommitted,
  isProjectBasisContractor,
} from "@/lib/domain/contractor";
import {
  DEFAULT_ORG_BUDGET_SETTINGS,
  effectiveCostRate,
  effectiveProjectBillRate,
} from "@/lib/domain/org-settings";
import { expandAssignmentInRange } from "@/lib/domain/recurrence";
import { assignmentHoursWithRecurrence } from "@/lib/domain/recurrence";
import {
  toDateKey,
  weekEnd,
  weekStart,
  workingDaysBetween,
} from "@/lib/domain/dates";

function effectiveContractorMode(
  person: Person,
  member: Pick<ProjectMember, "contractor_mode"> | null | undefined,
): ContractorMode | null {
  if (!isProjectBasisContractor(person)) return null;
  const mode = member?.contractor_mode ?? null;
  if (mode === "fixed_fee" || mode === "hours" || mode === "scheduled") {
    return mode;
  }
  return person.hide_from_schedule ? "fixed_fee" : "scheduled";
}

function classifyProjectPeople(
  projectId: string,
  assignments: Assignment[],
  people: Person[],
  projectMembers: ProjectMember[],
): {
  internalIds: Set<string>;
  contractorScheduledIds: Set<string>;
  contractorCommitIds: Set<string>;
  membersByPerson: Map<string, ProjectMember>;
  peopleById: Map<string, Person>;
} {
  const membersByPerson = new Map<string, ProjectMember>();
  for (const m of projectMembers) {
    if (m.project_id === projectId) membersByPerson.set(m.person_id, m);
  }
  const peopleById = new Map(people.map((p) => [p.id, p]));
  const rosterIds = new Set<string>();
  for (const m of projectMembers) {
    if (m.project_id === projectId) rosterIds.add(m.person_id);
  }
  for (const a of assignments) {
    if (a.project_id === projectId) rosterIds.add(a.person_id);
  }

  const internalIds = new Set<string>();
  const contractorScheduledIds = new Set<string>();
  const contractorCommitIds = new Set<string>();

  for (const personId of rosterIds) {
    const person = peopleById.get(personId);
    if (!person) continue;
    const member = membersByPerson.get(personId);
    const mode = effectiveContractorMode(person, member);
    if (mode === "fixed_fee" || mode === "hours") {
      contractorCommitIds.add(personId);
    } else if (mode === "scheduled") {
      contractorScheduledIds.add(personId);
    } else {
      internalIds.add(personId);
    }
  }

  return {
    internalIds,
    contractorScheduledIds,
    contractorCommitIds,
    membersByPerson,
    peopleById,
  };
}

function feeCommitIdsForProject(
  commitIds: Set<string>,
  membersByPerson: Map<string, ProjectMember>,
  peopleById: Map<string, Person>,
  monthlyRetainer: boolean,
): Set<string> {
  if (!monthlyRetainer) return commitIds;
  // Monthly retainers use Contractor Expenses for fixed fees; keep hours commits.
  const out = new Set<string>();
  for (const personId of commitIds) {
    const person = peopleById.get(personId);
    if (!person) continue;
    const mode = effectiveContractorMode(person, membersByPerson.get(personId));
    if (mode === "hours") out.add(personId);
  }
  return out;
}

/** Person ids whose contractor mode is Dollars (`fixed_fee`) for expense burns. */
export function dollarModeContractorPersonIds(
  people: Person[],
  membersByPerson: Map<string, Pick<ProjectMember, "contractor_mode">>,
): Set<string> {
  const out = new Set<string>();
  for (const person of people) {
    if (!isProjectBasisContractor(person)) continue;
    const mode = effectiveContractorMode(
      person,
      membersByPerson.get(person.id),
    );
    if (mode === "fixed_fee") out.add(person.id);
  }
  return out;
}

function attributeMonthlyExpenses(
  project: Project,
  contractorExpenses: ProjectContractorExpense[],
  people: Person[],
  monthKey: string,
  monthStart: string,
  asOf: Date,
  allowedPersonIds?: Set<string> | null,
): {
  usedHours: number;
  usedAmount: number;
  futureHours: number;
  futureAmount: number;
} {
  if (!isMonthlyRetainerBudget(project)) {
    return { usedHours: 0, usedAmount: 0, futureHours: 0, futureAmount: 0 };
  }
  const totals = contractorExpenseTotalsForMonth(
    project.id,
    contractorExpenses,
    people,
    monthKey,
    project,
    allowedPersonIds,
  );
  const todayKey = toDateKey(asOf);
  if (monthStart > todayKey) {
    return {
      usedHours: 0,
      usedAmount: 0,
      futureHours: totals.usedHours,
      futureAmount: totals.usedAmount,
    };
  }
  // Past and current months: treat expense as used/committed for the month.
  return {
    usedHours: totals.usedHours,
    usedAmount: totals.usedAmount,
    futureHours: 0,
    futureAmount: 0,
  };
}

function projectHoursInDateRangeForPeople(
  projectId: string,
  assignments: Assignment[],
  fromKey: string,
  toKey: string,
  personIds: Set<string>,
  includeTentative = false,
): number {
  if (toKey < fromKey || personIds.size === 0) return 0;
  return assignments
    .filter(
      (a) =>
        a.project_id === projectId &&
        personIds.has(a.person_id) &&
        (includeTentative || a.status === "confirmed"),
    )
    .reduce((sum, a) => {
      const occs = expandAssignmentInRange(a, fromKey, toKey);
      return (
        sum +
        occs.reduce(
          (s, occ) => s + occurrenceHoursInRange(occ, fromKey, toKey),
          0,
        )
      );
    }, 0);
}

function projectBillableAmountInDateRangeForPeople(
  projectId: string,
  assignments: Assignment[],
  people: Person[],
  fromKey: string,
  toKey: string,
  personIds: Set<string>,
  includeTentative = false,
  settings: OrganizationSettings = DEFAULT_ORG_BUDGET_SETTINGS,
): number {
  if (toKey < fromKey || personIds.size === 0) return 0;
  const byId = new Map(people.map((p) => [p.id, p]));
  let sum = 0;
  for (const a of assignments) {
    if (a.project_id !== projectId) continue;
    if (!personIds.has(a.person_id)) continue;
    if (!includeTentative && a.status !== "confirmed") continue;
    const rate = effectiveCostRate(byId.get(a.person_id), settings);
    for (const occ of expandAssignmentInRange(a, fromKey, toKey)) {
      sum += occurrenceHoursInRange(occ, fromKey, toKey) * rate;
    }
  }
  return sum;
}

/** Compare yyyy-MM (or yyyy-MM-dd) month keys. */
export function monthKeyCompare(a: string, b: string): number {
  return a.slice(0, 7).localeCompare(b.slice(0, 7));
}

/** Whether a calendar month falls inside the project start/end (if set). */
export function monthWithinProjectDates(
  project: Pick<Project, "start_date" | "end_date">,
  monthKey: string,
): boolean {
  const m = monthKey.slice(0, 7);
  if (project.start_date && m < project.start_date.slice(0, 7)) return false;
  if (project.end_date && m > project.end_date.slice(0, 7)) return false;
  return true;
}

/**
 * End month for a contractor apply window starting at `startMonthKey` (yyyy-MM):
 * min(project end, December of that calendar year).
 */
export function contractorApplyEndMonthKey(
  project: Pick<Project, "start_date" | "end_date">,
  startMonthKey: string,
): string {
  const y = Number(startMonthKey.slice(0, 4));
  let end = `${y}-12`;
  if (project.end_date) {
    const projectEnd = project.end_date.slice(0, 7);
    if (projectEnd < end) end = projectEnd;
  }
  return end;
}

/**
 * Hours-per-month commitments on retainers apply from max(project start, Jan of
 * year / current month when in asOf's year) through min(project end, Dec of year).
 * Future calendar years beyond asOf do not get hours until that year is active.
 */
export function hoursCommitmentAppliesInMonth(
  project: Pick<
    Project,
    | "start_date"
    | "end_date"
    | "budget_mode"
    | "budget_hours"
    | "budget_amount"
    | "budget_monthly_reset"
  >,
  monthKey: string,
  asOf: Date = new Date(),
): boolean {
  if (!monthWithinProjectDates(project, monthKey)) return false;
  if (!isMonthlyRetainerBudget(project)) return true;

  const m = monthKey.slice(0, 7);
  const y = Number(m.slice(0, 4));
  const asOfY = asOf.getFullYear();
  if (y > asOfY) return false;

  let windowStart = `${y}-01`;
  if (project.start_date && project.start_date.slice(0, 7) > windowStart) {
    windowStart = project.start_date.slice(0, 7);
  }
  if (y === asOfY) {
    const cur = format(asOf, "yyyy-MM");
    if (cur > windowStart) windowStart = cur;
  }
  const windowEnd = contractorApplyEndMonthKey(project, windowStart);
  return m >= windowStart && m <= windowEnd;
}

/** yyyy-MM keys from rangeStart through rangeEnd (inclusive), by calendar month. */
export function eachMonthKeyInRange(
  rangeStart: string,
  rangeEnd: string,
): string[] {
  if (rangeEnd < rangeStart) return [];
  const start = new Date(
    Number(rangeStart.slice(0, 4)),
    Number(rangeStart.slice(5, 7)) - 1,
    1,
  );
  const end = new Date(
    Number(rangeEnd.slice(0, 4)),
    Number(rangeEnd.slice(5, 7)) - 1,
    1,
  );
  const out: string[] = [];
  for (
    let d = start;
    d <= end;
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  ) {
    out.push(format(d, "yyyy-MM"));
  }
  return out;
}

/** Sum hours-per-month commitments across months in range that fall in the apply window. */
export function hoursCommitmentTotalInRange(
  project: Pick<
    Project,
    | "start_date"
    | "end_date"
    | "budget_mode"
    | "budget_hours"
    | "budget_amount"
    | "budget_monthly_reset"
  >,
  hoursPerMonth: number,
  rangeStart: string,
  rangeEnd: string,
  asOf: Date = new Date(),
): number {
  if (hoursPerMonth <= 0) return 0;
  let total = 0;
  for (const mk of eachMonthKeyInRange(rangeStart, rangeEnd)) {
    if (hoursCommitmentAppliesInMonth(project, mk, asOf)) {
      total += hoursPerMonth;
    }
  }
  return total;
}

/** Clamp end month for “from now” contractor apply (current month → year/project end). */
export function contractorApplyThroughMonthKey(
  project: Pick<Project, "start_date" | "end_date">,
  asOf: Date = new Date(),
): string {
  let start = format(asOf, "yyyy-MM");
  if (project.start_date && project.start_date.slice(0, 7) > start) {
    start = project.start_date.slice(0, 7);
  }
  return contractorApplyEndMonthKey(project, start);
}

export function contractorApplyThroughLabel(
  project: Pick<Project, "start_date" | "end_date">,
  asOf: Date = new Date(),
): string {
  const end = contractorApplyThroughMonthKey(project, asOf);
  return format(
    new Date(Number(end.slice(0, 4)), Number(end.slice(5, 7)) - 1, 1),
    "MMMM yyyy",
  );
}

export function contractorApplyWindowToastMessage(
  project: Pick<Project, "start_date" | "end_date">,
  asOf: Date = new Date(),
): string {
  return `Contractor hours/expenses applied through ${contractorApplyThroughLabel(project, asOf)}.`;
}

/**
 * When a prior-year Repeat Monthly row no longer covers Jan of `asOf`'s year,
 * build a continuation row starting that January (same amount/notes).
 */
export function buildNewYearRepeatExpenseContinuations(
  project: Pick<Project, "id" | "start_date" | "end_date">,
  expenses: ProjectContractorExpense[],
  newId: () => string,
  asOf: Date = new Date(),
): Array<
  Omit<ProjectContractorExpense, "organization_id"> & {
    organization_id?: string;
  }
> {
  const year = asOf.getFullYear();
  const janKey = `${year}-01`;
  const janMonthKey = `${janKey}-01`;
  if (!monthWithinProjectDates(project, janKey)) return [];

  const byPerson = new Map<string, ProjectContractorExpense[]>();
  for (const e of expenses) {
    if (e.project_id !== project.id) continue;
    const list = byPerson.get(e.person_id) ?? [];
    list.push(e);
    byPerson.set(e.person_id, list);
  }

  const out: Array<
    Omit<ProjectContractorExpense, "organization_id"> & {
      organization_id?: string;
    }
  > = [];
  const nowIso = asOf.toISOString();

  for (const [personId, list] of byPerson) {
    const coversJan = list.some((e) =>
      contractorExpenseAppliesInMonth(project, e, janKey),
    );
    if (coversJan) continue;

    const priorRepeats = list
      .filter(
        (e) =>
          e.repeat_monthly &&
          Number(e.month_key.slice(0, 4)) < year &&
          e.amount > 0,
      )
      .sort((a, b) => monthKeyCompare(b.month_key, a.month_key));
    const prior = priorRepeats[0];
    if (!prior) continue;

    out.push({
      id: newId(),
      project_id: project.id,
      person_id: personId,
      month_key: janMonthKey,
      amount: prior.amount,
      notes: prior.notes ?? "",
      repeat_monthly: true,
      created_at: nowIso,
      updated_at: nowIso,
      created_by_profile_id: null,
    });
  }
  return out;
}

/** Whether Hours / Repeat Monthly settings warrant a through-date toast on save. */
export function shouldToastContractorApplyWindow(
  project: Pick<
    Project,
    | "id"
    | "start_date"
    | "end_date"
    | "budget_mode"
    | "budget_hours"
    | "budget_amount"
    | "budget_monthly_reset"
  >,
  members: Array<
    Pick<
      ProjectMember,
      "contractor_mode" | "contractor_hours" | "person_id"
    >
  >,
  expenses: Array<
    Pick<
      ProjectContractorExpense,
      "project_id" | "repeat_monthly" | "month_key" | "amount"
    >
  >,
  asOf: Date = new Date(),
): boolean {
  if (!isMonthlyRetainerBudget(project)) return false;
  const cur = format(asOf, "yyyy-MM");
  if (hoursCommitmentAppliesInMonth(project, cur, asOf)) {
    for (const m of members) {
      if (
        m.contractor_mode === "hours" &&
        (m.contractor_hours ?? 0) > 0
      ) {
        return true;
      }
    }
  }
  for (const e of expenses) {
    if (e.project_id !== project.id) continue;
    if (e.repeat_monthly && contractorExpenseAppliesInMonth(project, e, cur)) {
      return true;
    }
  }
  return false;
}

/** Whether a stored expense line attributes cost to the given calendar month. */
export function contractorExpenseAppliesInMonth(
  project: Pick<Project, "start_date" | "end_date">,
  expense: Pick<
    ProjectContractorExpense,
    "month_key" | "repeat_monthly"
  >,
  monthKey: string,
): boolean {
  if (!monthWithinProjectDates(project, monthKey)) return false;
  const prefix = monthKey.slice(0, 7);
  const expenseMonth = expense.month_key.slice(0, 7);
  if (expense.repeat_monthly) {
    if (expenseMonth > prefix) return false;
    const end = contractorApplyEndMonthKey(project, expenseMonth);
    return prefix <= end;
  }
  return expenseMonth === prefix;
}

function expenseHoursFromAmount(
  amount: number,
  person: Person | undefined,
  settings: OrganizationSettings = DEFAULT_ORG_BUDGET_SETTINGS,
): number {
  if (!person || amount <= 0) return 0;
  const rate = effectiveCostRate(person, settings);
  return rate > 0 ? amount / rate : 0;
}

/** Sum contractor expenses for a project in a given yyyy-MM month. */
export function contractorExpenseTotalsForMonth(
  projectId: string,
  expenses: ProjectContractorExpense[],
  people: Person[],
  monthKey: string,
  project?: Pick<Project, "start_date" | "end_date" | "id"> | null,
  allowedPersonIds?: Set<string> | null,
  settings: OrganizationSettings = DEFAULT_ORG_BUDGET_SETTINGS,
): { usedHours: number; usedAmount: number } {
  const peopleById = new Map(people.map((p) => [p.id, p]));
  let usedHours = 0;
  let usedAmount = 0;
  for (const e of expenses) {
    if (e.project_id !== projectId) continue;
    if (allowedPersonIds && !allowedPersonIds.has(e.person_id)) continue;
    if (project) {
      if (!contractorExpenseAppliesInMonth(project, e, monthKey)) continue;
    } else {
      const prefix = monthKey.slice(0, 7);
      const expenseMonth = e.month_key.slice(0, 7);
      const applies = e.repeat_monthly
        ? expenseMonth <= prefix
        : expenseMonth === prefix;
      if (!applies) continue;
    }
    usedAmount += e.amount;
    usedHours += expenseHoursFromAmount(
      e.amount,
      peopleById.get(e.person_id),
      settings,
    );
  }
  return { usedHours, usedAmount };
}

export type ContractorExpenseLine = {
  rowId: string;
  expenseId: string;
  personId: string;
  monthKey: string;
  amount: number;
  hours: number;
  notes: string;
};

/**
 * Expand expense rows into per-month lines inside [rangeStart, rangeEnd]
 * (inclusive), respecting repeat_monthly and project/year clamps.
 */
export function contractorExpenseLinesInRange(
  project: Pick<Project, "id" | "start_date" | "end_date">,
  expenses: ProjectContractorExpense[],
  people: Person[],
  rangeStart: string,
  rangeEnd: string,
  personId?: string | null,
  settings: OrganizationSettings = DEFAULT_ORG_BUDGET_SETTINGS,
): ContractorExpenseLine[] {
  if (rangeEnd < rangeStart) return [];
  const peopleById = new Map(people.map((p) => [p.id, p]));
  const start = new Date(
    Number(rangeStart.slice(0, 4)),
    Number(rangeStart.slice(5, 7)) - 1,
    1,
  );
  const end = new Date(
    Number(rangeEnd.slice(0, 4)),
    Number(rangeEnd.slice(5, 7)) - 1,
    1,
  );
  const out: ContractorExpenseLine[] = [];
  for (
    let d = start;
    d <= end;
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  ) {
    const mk = format(d, "yyyy-MM");
    for (const e of expenses) {
      if (e.project_id !== project.id) continue;
      if (personId && e.person_id !== personId) continue;
      if (!contractorExpenseAppliesInMonth(project, e, mk)) continue;
      out.push({
        rowId: `${e.id}:${mk}`,
        expenseId: e.id,
        personId: e.person_id,
        monthKey: `${mk}-01`,
        amount: e.amount,
        hours: expenseHoursFromAmount(e.amount, peopleById.get(e.person_id), settings),
        notes: e.notes ?? "",
      });
    }
  }
  return out;
}

/**
 * Aggregate per-month expense lines into one row per expenseId
 * (amount × months in range). No notes.
 */
export function contractorExpenseAggregatesInRange(
  project: Pick<Project, "id" | "start_date" | "end_date">,
  expenses: ProjectContractorExpense[],
  people: Person[],
  rangeStart: string,
  rangeEnd: string,
  personId?: string | null,
): Array<{
  rowId: string;
  expenseId: string;
  personId: string;
  amount: number;
  hours: number;
}> {
  const lines = contractorExpenseLinesInRange(
    project,
    expenses,
    people,
    rangeStart,
    rangeEnd,
    personId,
  );
  const byExpense = new Map<
    string,
    { expenseId: string; personId: string; amount: number; hours: number }
  >();
  for (const line of lines) {
    const existing = byExpense.get(line.expenseId);
    if (existing) {
      existing.amount += line.amount;
      existing.hours += line.hours;
    } else {
      byExpense.set(line.expenseId, {
        expenseId: line.expenseId,
        personId: line.personId,
        amount: line.amount,
        hours: line.hours,
      });
    }
  }
  return [...byExpense.values()].map((row) => ({
    rowId: row.expenseId,
    ...row,
  }));
}

/** Sum contractor expense $ (and derived hours) across an inclusive date range. */
export function contractorExpenseTotalsInRange(
  projectId: string,
  expenses: ProjectContractorExpense[],
  people: Person[],
  rangeStart: string,
  rangeEnd: string,
  project?: Pick<Project, "start_date" | "end_date" | "id"> | null,
): { hours: number; amount: number } {
  const split = contractorExpenseSplitInRange(
    projectId,
    expenses,
    people,
    rangeStart,
    rangeEnd,
    new Date(),
    project,
  );
  return {
    hours: split.usedHours + split.futureHours,
    amount: split.usedAmount + split.futureAmount,
  };
}

/** Expense used vs future within a date range (by calendar month vs asOf). */
export function contractorExpenseSplitInRange(
  projectId: string,
  expenses: ProjectContractorExpense[],
  people: Person[],
  rangeStart: string,
  rangeEnd: string,
  asOf: Date = new Date(),
  project?: Pick<Project, "start_date" | "end_date" | "id"> | null,
): {
  usedHours: number;
  futureHours: number;
  usedAmount: number;
  futureAmount: number;
} {
  if (rangeEnd < rangeStart) {
    return { usedHours: 0, futureHours: 0, usedAmount: 0, futureAmount: 0 };
  }
  const todayKey = toDateKey(asOf);
  const start = new Date(
    Number(rangeStart.slice(0, 4)),
    Number(rangeStart.slice(5, 7)) - 1,
    1,
  );
  const end = new Date(
    Number(rangeEnd.slice(0, 4)),
    Number(rangeEnd.slice(5, 7)) - 1,
    1,
  );
  let usedHours = 0;
  let futureHours = 0;
  let usedAmount = 0;
  let futureAmount = 0;
  for (
    let d = start;
    d <= end;
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  ) {
    const monthStart = toDateKey(startOfMonth(d));
    const totals = contractorExpenseTotalsForMonth(
      projectId,
      expenses,
      people,
      format(d, "yyyy-MM"),
      project ?? null,
    );
    if (monthStart > todayKey) {
      futureHours += totals.usedHours;
      futureAmount += totals.usedAmount;
    } else {
      usedHours += totals.usedHours;
      usedAmount += totals.usedAmount;
    }
  }
  return { usedHours, futureHours, usedAmount, futureAmount };
}

function contractorCommitmentTotals(
  projectId: string,
  commitIds: Set<string>,
  membersByPerson: Map<string, ProjectMember>,
  peopleById: Map<string, Person>,
  assignments: Assignment[],
  rangeStart: string,
  rangeEnd: string,
  includeTentative: boolean,
  settings: OrganizationSettings = DEFAULT_ORG_BUDGET_SETTINGS,
): {
  usedHours: number;
  futureHours: number;
  usedAmount: number;
  futureAmount: number;
} {
  let usedHours = 0;
  let usedAmount = 0;
  for (const personId of commitIds) {
    const person = peopleById.get(personId);
    if (!person) continue;
    const member = membersByPerson.get(personId);
    const scheduledHours = projectHoursInDateRangeForPeople(
      projectId,
      assignments,
      rangeStart,
      rangeEnd,
      new Set([personId]),
      includeTentative,
    );
    const scheduledAmount = projectBillableAmountInDateRangeForPeople(
      projectId,
      assignments,
      [...peopleById.values()],
      rangeStart,
      rangeEnd,
      new Set([personId]),
      includeTentative,
      settings,
    );
    const committed = contractorCommitted(person, member, {
      settings,
      scheduledHours,
      scheduledAmount,
    });
    usedHours += committed.hours;
    usedAmount += committed.amount;
  }
  return {
    usedHours,
    futureHours: 0,
    usedAmount,
    futureAmount: 0,
  };
}

/** Month key (yyyy-MM) for fixed-fee / hours contractor commitment attribution. */
export function contractorCommitmentMonthKey(
  project: Project,
  asOf: Date = new Date(),
): string {
  if (project.start_date) return project.start_date.slice(0, 7);
  return format(asOf, "yyyy-MM");
}

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

/** Hours or dollar budget with calendar-month reset (retainer). */
export function isMonthlyRetainerBudget(
  project: Pick<
    Project,
    "budget_mode" | "budget_hours" | "budget_amount" | "budget_monthly_reset"
  >,
): boolean {
  if (!project.budget_monthly_reset) return false;
  const mode = normalizeBudgetMode(
    project.budget_mode,
    project.budget_hours,
    project.budget_amount,
  );
  return mode === "hours" || mode === "amount";
}

/** Sidebar / Progress card heading for retainers vs standard projects. */
export function projectProgressCardTitle(monthlyRetainer: boolean): string {
  return monthlyRetainer ? "Contract" : "Progress";
}

/**
 * ProgressBar label. Retainers use "Contract Term"; others "Overall Progress".
 * `formatDate` defaults to the raw date key when omitted.
 */
export function projectProgressBarLabel(
  startDate: string | null,
  endDate: string | null,
  monthlyRetainer: boolean,
  formatDate: (dateKey: string) => string = (d) => d,
): string {
  const head = monthlyRetainer ? "Contract Term" : "Overall Progress";
  if (startDate && endDate) {
    return `${head} · ${formatDate(startDate)} – ${formatDate(endDate)}`;
  }
  if (startDate) return `${head} · from ${formatDate(startDate)}`;
  if (endDate) return `${head} · through ${formatDate(endDate)}`;
  return head;
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
  settings: OrganizationSettings = DEFAULT_ORG_BUDGET_SETTINGS,
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
      const rate = effectiveCostRate(person, settings);
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
 * - amount: planned $ (hours × person cost_rate) vs budget_amount
 * Hourly and dollar are mutually exclusive — never both.
 */
export function budgetBurn(
  project: Project,
  assignments: Assignment[],
  people: Person[],
  includeTentative = false,
  asOf: Date = new Date(),
  projectMembers: ProjectMember[] = [],
  contractorExpenses: ProjectContractorExpense[] = [],
  settings: OrganizationSettings = DEFAULT_ORG_BUDGET_SETTINGS,
): BudgetBurn {
  const mode = normalizeBudgetMode(
    project.budget_mode,
    project.budget_hours,
    project.budget_amount,
  );

  const todayKey = toDateKey(asOf);
  const tomorrow = new Date(asOf);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = toDateKey(tomorrow);

  let rangeStart = "1970-01-01";
  let rangeEnd = "2099-12-31";
  if (isMonthlyRetainerBudget(project)) {
    rangeStart = toDateKey(startOfMonth(asOf));
    rangeEnd = toDateKey(endOfMonth(asOf));
  }

  const usedEnd = todayKey < rangeEnd ? todayKey : rangeEnd;
  const futureStart = tomorrowKey > rangeStart ? tomorrowKey : rangeStart;

  const hasContractorTerms = projectMembers.some(
    (m) => m.project_id === project.id,
  );
  const classified = hasContractorTerms
    ? classifyProjectPeople(
        project.id,
        assignments,
        people,
        projectMembers,
      )
    : null;

  let internalUsedHours = 0;
  let internalFutureHours = 0;
  let internalUsedAmount = 0;
  let internalFutureAmount = 0;
  let contractorUsedHours = 0;
  let contractorFutureHours = 0;
  let contractorUsedAmount = 0;
  let contractorFutureAmount = 0;

  if (classified) {
    const {
      internalIds,
      contractorScheduledIds,
      contractorCommitIds,
      membersByPerson,
      peopleById,
    } = classified;

    if (usedEnd >= rangeStart) {
      internalUsedHours = projectHoursInDateRangeForPeople(
        project.id,
        assignments,
        rangeStart,
        usedEnd,
        internalIds,
        includeTentative,
      );
      contractorUsedHours = projectHoursInDateRangeForPeople(
        project.id,
        assignments,
        rangeStart,
        usedEnd,
        contractorScheduledIds,
        includeTentative,
      );
      internalUsedAmount = projectBillableAmountInDateRangeForPeople(
        project.id,
        assignments,
        people,
        rangeStart,
        usedEnd,
        internalIds,
        includeTentative,
        settings,
      );
      contractorUsedAmount = projectBillableAmountInDateRangeForPeople(
        project.id,
        assignments,
        people,
        rangeStart,
        usedEnd,
        contractorScheduledIds,
        includeTentative,
        settings,
      );
      const monthly = isMonthlyRetainerBudget(project);
      const asOfMonth = format(asOf, "yyyy-MM");
      const hoursInWindow =
        !monthly || hoursCommitmentAppliesInMonth(project, asOfMonth, asOf);
      const commitUsed = hoursInWindow
        ? contractorCommitmentTotals(
            project.id,
            feeCommitIdsForProject(
              contractorCommitIds,
              membersByPerson,
              peopleById,
              monthly,
            ),
            membersByPerson,
            peopleById,
            assignments,
            rangeStart,
            rangeEnd,
            includeTentative,
            settings,
          )
        : { usedHours: 0, usedAmount: 0 };
      contractorUsedHours += commitUsed.usedHours;
      contractorUsedAmount += commitUsed.usedAmount;
      if (monthly) {
        const dollarIds = dollarModeContractorPersonIds(
          people,
          membersByPerson,
        );
        const expenseUsed = contractorExpenseTotalsForMonth(
          project.id,
          contractorExpenses,
          people,
          asOfMonth,
          project,
          dollarIds,
        );
        contractorUsedHours += expenseUsed.usedHours;
        contractorUsedAmount += expenseUsed.usedAmount;
      }
    }
    if (futureStart <= rangeEnd) {
      internalFutureHours = projectHoursInDateRangeForPeople(
        project.id,
        assignments,
        futureStart,
        rangeEnd,
        internalIds,
        includeTentative,
      );
      contractorFutureHours = projectHoursInDateRangeForPeople(
        project.id,
        assignments,
        futureStart,
        rangeEnd,
        contractorScheduledIds,
        includeTentative,
      );
      internalFutureAmount = projectBillableAmountInDateRangeForPeople(
        project.id,
        assignments,
        people,
        futureStart,
        rangeEnd,
        internalIds,
        includeTentative,
        settings,
      );
      contractorFutureAmount = projectBillableAmountInDateRangeForPeople(
        project.id,
        assignments,
        people,
        futureStart,
        rangeEnd,
        contractorScheduledIds,
        includeTentative,
        settings,
      );
    }
  } else {
    internalUsedHours =
      usedEnd >= rangeStart
        ? projectHoursInDateRange(
            project.id,
            assignments,
            rangeStart,
            usedEnd,
            includeTentative,
          )
        : 0;
    internalFutureHours =
      futureStart <= rangeEnd
        ? projectHoursInDateRange(
            project.id,
            assignments,
            futureStart,
            rangeEnd,
            includeTentative,
          )
        : 0;
    internalUsedAmount =
      usedEnd >= rangeStart
        ? projectBillableAmountInDateRange(
            project.id,
            assignments,
            people,
            rangeStart,
            usedEnd,
            includeTentative,
            settings,
          )
        : 0;
    internalFutureAmount =
      futureStart <= rangeEnd
        ? projectBillableAmountInDateRange(
            project.id,
            assignments,
            people,
            futureStart,
            rangeEnd,
            includeTentative,
            settings,
          )
        : 0;
  }

  if (isMonthlyRetainerBudget(project) && contractorExpenses.length > 0) {
    // When there is no roster classification path, still attribute this month's expenses.
    // (classified path already added expenses above.)
    if (!classified) {
      const expenseUsed = contractorExpenseTotalsForMonth(
        project.id,
        contractorExpenses,
        people,
        format(asOf, "yyyy-MM"),
        project,
      );
      contractorUsedHours += expenseUsed.usedHours;
      contractorUsedAmount += expenseUsed.usedAmount;
    }
  }

  const usedHours = internalUsedHours + contractorUsedHours;
  const futureHours = internalFutureHours + contractorFutureHours;
  const plannedHours = usedHours + futureHours;
  const usedAmount = internalUsedAmount + contractorUsedAmount;
  const futureAmount = internalFutureAmount + contractorFutureAmount;
  const plannedAmount = usedAmount + futureAmount;
  const contractorHours = contractorUsedHours + contractorFutureHours;
  const contractorAmount = contractorUsedAmount + contractorFutureAmount;

  const contractorFields = {
    contractorHours,
    contractorAmount,
    contractorUsedHours,
    contractorFutureHours,
    contractorUsedAmount,
    contractorFutureAmount,
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
    pct: totalHours <= 0 ? 0 : Math.min(999, (plannedHours / totalHours) * 100),
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

export function budgetHealth(
  burn: BudgetBurn,
  settings: OrganizationSettings = DEFAULT_ORG_BUDGET_SETTINGS,
): "healthy" | "near" | "over" | "none" {
  if (burn.mode === "none") return "none";
  if (burn.mode === "amount") {
    if (burn.amountOverBy > 0 || burn.pct >= settings.amount_over_pct) return "over";
    if (burn.pct >= settings.amount_warning_pct) return "near";
    return "healthy";
  }
  if (burn.overBy > 0 || burn.pct > settings.hours_over_pct) return "over";
  if (burn.pct >= settings.hours_warning_pct) return "near";
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

/** Compact currency labels for chart Y-axis ticks. */
export function formatChartMoneyAxis(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) {
    const v = amount / 1_000_000;
    return `$${Number.isInteger(v) ? v : v.toFixed(1)}M`;
  }
  if (abs >= 1000) {
    const v = amount / 1000;
    return `$${Number.isInteger(v) ? v : v.toFixed(1)}k`;
  }
  return formatMoney(amount);
}

export interface MonthBurnBar {
  key: string;
  label: string;
  year: number;
  monthIndex: number;
  plannedHours: number;
  /** Planned labor cost $ for the month (hours × cost rates). */
  plannedAmount: number;
  /** Internal schedule hours through today (or full month if past). */
  usedHours: number;
  /** Internal schedule hours from tomorrow onward (or full month if future). */
  futureHours: number;
  /** Internal billable $ through today (or full month if past). */
  usedAmount: number;
  /** Internal billable $ from tomorrow onward (or full month if future). */
  futureAmount: number;
  /** Contractor hours in month (used + future). */
  contractorHours: number;
  contractorAmount: number;
  contractorUsedHours: number;
  contractorFutureHours: number;
  contractorUsedAmount: number;
  contractorFutureAmount: number;
  /** Primary bar value (hours or $ depending on chart context). */
  value: number;
  /** Soft monthly cap for over-coloring; 0 means scale against the year’s max. */
  cap: number;
  budgetHours: number;
  pct: number;
}

function monthBurnSplit(
  project: Project,
  assignments: Assignment[],
  people: Person[],
  year: number,
  monthIndex: number,
  asOf: Date,
  projectMembers: ProjectMember[],
  contractorExpenses: ProjectContractorExpense[] = [],
  settings: OrganizationSettings = DEFAULT_ORG_BUDGET_SETTINGS,
): {
  usedHours: number;
  futureHours: number;
  usedAmount: number;
  futureAmount: number;
  contractorHours: number;
  contractorAmount: number;
  contractorUsedHours: number;
  contractorFutureHours: number;
  contractorUsedAmount: number;
  contractorFutureAmount: number;
  plannedHours: number;
  plannedAmount: number;
} {
  const monthStart = toDateKey(startOfMonth(new Date(year, monthIndex, 1)));
  const monthEnd = toDateKey(endOfMonth(new Date(year, monthIndex, 1)));
  const monthKey = format(new Date(year, monthIndex, 1), "yyyy-MM");
  const commitMonthKey = contractorCommitmentMonthKey(project, asOf);

  const hasContractorTerms = projectMembers.some(
    (m) => m.project_id === project.id,
  );
  const classifiedPeople = hasContractorTerms
    ? classifyProjectPeople(
        project.id,
        assignments,
        people,
        projectMembers,
      )
    : null;
  const dollarIds = classifiedPeople
    ? dollarModeContractorPersonIds(
        people,
        classifiedPeople.membersByPerson,
      )
    : null;
  const monthExpenses = attributeMonthlyExpenses(
    project,
    contractorExpenses,
    people,
    monthKey,
    monthStart,
    asOf,
    dollarIds,
  );
  if (!classifiedPeople) {
    const split = projectHoursSplitInRange(
      project.id,
      assignments,
      people,
      monthStart,
      monthEnd,
      asOf,
    );
    const plannedHours = projectPlannedHours(project.id, assignments, false, {
      year,
      monthIndex,
    });
    const plannedAmount = projectPlannedAmount(
      project.id,
      assignments,
      people,
      false,
      { year, monthIndex },
    );
    const expenseUsedHours = monthExpenses.usedHours;
    const expenseUsedAmount = monthExpenses.usedAmount;
    const expenseFutureHours = monthExpenses.futureHours;
    const expenseFutureAmount = monthExpenses.futureAmount;
    const expenseHours = expenseUsedHours + expenseFutureHours;
    const expenseAmount = expenseUsedAmount + expenseFutureAmount;
    return {
      ...split,
      usedHours: split.usedHours + expenseUsedHours,
      usedAmount: split.usedAmount + expenseUsedAmount,
      futureHours: split.futureHours + expenseFutureHours,
      futureAmount: split.futureAmount + expenseFutureAmount,
      contractorHours: expenseHours,
      contractorAmount: expenseAmount,
      contractorUsedHours: expenseUsedHours,
      contractorFutureHours: expenseFutureHours,
      contractorUsedAmount: expenseUsedAmount,
      contractorFutureAmount: expenseFutureAmount,
      plannedHours: plannedHours + expenseHours,
      plannedAmount: plannedAmount + expenseAmount,
    };
  }

  const {
    internalIds,
    contractorScheduledIds,
    contractorCommitIds,
    membersByPerson,
    peopleById,
  } = classifiedPeople;

  const todayKey = toDateKey(asOf);
  const tomorrow = new Date(asOf);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = toDateKey(tomorrow);
  const usedEnd = todayKey < monthEnd ? todayKey : monthEnd;
  const futureStart = tomorrowKey > monthStart ? tomorrowKey : monthStart;

  let internalUsedHours = 0;
  let internalFutureHours = 0;
  let contractorUsedHours = 0;
  let contractorFutureHours = 0;
  let internalUsedAmount = 0;
  let internalFutureAmount = 0;
  let contractorUsedAmount = 0;
  let contractorFutureAmount = 0;

  const monthly = isMonthlyRetainerBudget(project);
  const feeCommitIds = feeCommitIdsForProject(
    contractorCommitIds,
    membersByPerson,
    peopleById,
    monthly,
  );

  if (usedEnd >= monthStart) {
    internalUsedHours = projectHoursInDateRangeForPeople(
      project.id,
      assignments,
      monthStart,
      usedEnd,
      internalIds,
    );
    contractorUsedHours = projectHoursInDateRangeForPeople(
      project.id,
      assignments,
      monthStart,
      usedEnd,
      contractorScheduledIds,
    );
    internalUsedAmount = projectBillableAmountInDateRangeForPeople(
      project.id,
      assignments,
      people,
      monthStart,
      usedEnd,
      internalIds,
    );
    contractorUsedAmount = projectBillableAmountInDateRangeForPeople(
      project.id,
      assignments,
      people,
      monthStart,
      usedEnd,
      contractorScheduledIds,
    );
    if (!monthly && monthKey === commitMonthKey) {
      const commit = contractorCommitmentTotals(
        project.id,
        feeCommitIds,
        membersByPerson,
        peopleById,
        assignments,
        monthStart,
        monthEnd,
        false,
        settings,
      );
      contractorUsedHours += commit.usedHours;
      contractorUsedAmount += commit.usedAmount;
    }
  }
  if (futureStart <= monthEnd) {
    internalFutureHours = projectHoursInDateRangeForPeople(
      project.id,
      assignments,
      futureStart,
      monthEnd,
      internalIds,
    );
    contractorFutureHours = projectHoursInDateRangeForPeople(
      project.id,
      assignments,
      futureStart,
      monthEnd,
      contractorScheduledIds,
    );
    internalFutureAmount = projectBillableAmountInDateRangeForPeople(
      project.id,
      assignments,
      people,
      futureStart,
      monthEnd,
      internalIds,
    );
    contractorFutureAmount = projectBillableAmountInDateRangeForPeople(
      project.id,
      assignments,
      people,
      futureStart,
      monthEnd,
      contractorScheduledIds,
    );
  }

  if (
    monthly &&
    feeCommitIds.size > 0 &&
    hoursCommitmentAppliesInMonth(project, monthKey, asOf)
  ) {
    const commit = contractorCommitmentTotals(
      project.id,
      feeCommitIds,
      membersByPerson,
      peopleById,
      assignments,
      monthStart,
      monthEnd,
      false,
      settings,
    );
    if (monthStart > todayKey) {
      contractorFutureHours += commit.usedHours;
      contractorFutureAmount += commit.usedAmount;
    } else {
      contractorUsedHours += commit.usedHours;
      contractorUsedAmount += commit.usedAmount;
    }
  }

  // Expenses apply to the whole month (used or future), even when the used
  // window does not overlap (pure future months).
  contractorUsedHours += monthExpenses.usedHours;
  contractorUsedAmount += monthExpenses.usedAmount;
  contractorFutureHours += monthExpenses.futureHours;
  contractorFutureAmount += monthExpenses.futureAmount;

  const plannedHours =
    internalUsedHours +
    internalFutureHours +
    contractorUsedHours +
    contractorFutureHours;
  const plannedAmount =
    internalUsedAmount +
    internalFutureAmount +
    contractorUsedAmount +
    contractorFutureAmount;

  return {
    usedHours: internalUsedHours,
    futureHours: internalFutureHours,
    usedAmount: internalUsedAmount,
    futureAmount: internalFutureAmount,
    contractorHours: contractorUsedHours + contractorFutureHours,
    contractorAmount: contractorUsedAmount + contractorFutureAmount,
    contractorUsedHours,
    contractorFutureHours,
    contractorUsedAmount,
    contractorFutureAmount,
    plannedHours,
    plannedAmount,
  };
}

/** Used vs future hours/$ in [rangeStart, rangeEnd] using today/tomorrow split. */
export function projectHoursSplitInRange(
  projectId: string,
  assignments: Assignment[],
  people: Person[],
  rangeStart: string,
  rangeEnd: string,
  asOf: Date = new Date(),
  settings: OrganizationSettings = DEFAULT_ORG_BUDGET_SETTINGS,
): {
  usedHours: number;
  futureHours: number;
  usedAmount: number;
  futureAmount: number;
} {
  const todayKey = toDateKey(asOf);
  const tomorrow = new Date(asOf);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = toDateKey(tomorrow);

  const usedEnd = todayKey < rangeEnd ? todayKey : rangeEnd;
  const futureStart = tomorrowKey > rangeStart ? tomorrowKey : rangeStart;

  const usedHours =
    usedEnd >= rangeStart
      ? projectHoursInDateRange(
          projectId,
          assignments,
          rangeStart,
          usedEnd,
        )
      : 0;
  const futureHours =
    futureStart <= rangeEnd
      ? projectHoursInDateRange(
          projectId,
          assignments,
          futureStart,
          rangeEnd,
        )
      : 0;
  const usedAmount =
    usedEnd >= rangeStart
      ? projectBillableAmountInDateRange(
          projectId,
          assignments,
          people,
          rangeStart,
          usedEnd,
          false,
          settings,
        )
      : 0;
  const futureAmount =
    futureStart <= rangeEnd
      ? projectBillableAmountInDateRange(
          projectId,
          assignments,
          people,
          futureStart,
          rangeEnd,
          false,
          settings,
        )
      : 0;

  return { usedHours, futureHours, usedAmount, futureAmount };
}

/** Per-person used vs future hours in [rangeStart, rangeEnd]. */
export function personHoursSplitInRange(
  personId: string,
  projectId: string,
  assignments: Assignment[],
  rangeStart: string,
  rangeEnd: string,
  asOf: Date = new Date(),
): { usedHours: number; futureHours: number } {
  const filtered = assignments.filter(
    (a) =>
      a.project_id === projectId &&
      a.person_id === personId &&
      a.status === "confirmed",
  );
  const todayKey = toDateKey(asOf);
  const tomorrow = new Date(asOf);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = toDateKey(tomorrow);

  const usedEnd = todayKey < rangeEnd ? todayKey : rangeEnd;
  const futureStart = tomorrowKey > rangeStart ? tomorrowKey : rangeStart;

  let usedHours = 0;
  let futureHours = 0;
  for (const a of filtered) {
    if (usedEnd >= rangeStart) {
      for (const occ of expandAssignmentInRange(a, rangeStart, usedEnd)) {
        usedHours += occurrenceHoursInRange(occ, rangeStart, usedEnd);
      }
    }
    if (futureStart <= rangeEnd) {
      for (const occ of expandAssignmentInRange(a, futureStart, rangeEnd)) {
        futureHours += occurrenceHoursInRange(occ, futureStart, rangeEnd);
      }
    }
  }
  return { usedHours, futureHours };
}

/** Last N months of hourly burn for monthly-reset (retainer) projects. */
export function monthlyHourBars(
  project: Project,
  assignments: Assignment[],
  months = 6,
  asOf: Date = new Date(),
  projectMembers: ProjectMember[] = [],
): MonthBurnBar[] {
  const budgetHours = project.budget_hours ?? 0;
  const out: MonthBurnBar[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(asOf.getFullYear(), asOf.getMonth() - i, 1);
    const year = d.getFullYear();
    const monthIndex = d.getMonth();
    const split = monthBurnSplit(
      project,
      assignments,
      [],
      year,
      monthIndex,
      asOf,
      projectMembers,
    );
    out.push({
      key: format(d, "yyyy-MM"),
      label: format(d, "MMM yyyy"),
      year,
      monthIndex,
      plannedHours: split.plannedHours,
      plannedAmount: split.plannedAmount,
      usedHours: split.usedHours,
      futureHours: split.futureHours,
      usedAmount: split.usedAmount,
      futureAmount: split.futureAmount,
      contractorHours: split.contractorHours,
      contractorAmount: split.contractorAmount,
      contractorUsedHours: split.contractorUsedHours,
      contractorFutureHours: split.contractorFutureHours,
      contractorUsedAmount: split.contractorUsedAmount,
      contractorFutureAmount: split.contractorFutureAmount,
      value: split.plannedHours,
      cap: budgetHours,
      budgetHours,
      pct:
        budgetHours <= 0
          ? 0
          : Math.min(999, (split.plannedHours / budgetHours) * 100),
    });
  }
  return out;
}

/** Jan–Dec bars for the given calendar year (hours or $ by budget mode). */
export function calendarYearBars(
  project: Project,
  assignments: Assignment[],
  people: Person[],
  year: number,
  asOf: Date = new Date(),
  projectMembers: ProjectMember[] = [],
  contractorExpenses: ProjectContractorExpense[] = [],
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
  const out: MonthBurnBar[] = [];
  for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
    const d = new Date(year, monthIndex, 1);
    const split = monthBurnSplit(
      project,
      assignments,
      people,
      year,
      monthIndex,
      asOf,
      projectMembers,
      contractorExpenses,
    );
    const value = mode === "amount" ? split.plannedAmount : split.plannedHours;
    const cap = monthlyCap;
    out.push({
      key: format(d, "yyyy-MM"),
      label: format(d, "MMM yyyy"),
      year,
      monthIndex,
      plannedHours: split.plannedHours,
      plannedAmount: split.plannedAmount,
      usedHours: split.usedHours,
      futureHours: split.futureHours,
      usedAmount: split.usedAmount,
      futureAmount: split.futureAmount,
      contractorHours: split.contractorHours,
      contractorAmount: split.contractorAmount,
      contractorUsedHours: split.contractorUsedHours,
      contractorFutureHours: split.contractorFutureHours,
      contractorUsedAmount: split.contractorUsedAmount,
      contractorFutureAmount: split.contractorFutureAmount,
      value,
      cap,
      budgetHours: mode === "hours" ? monthlyCap : 0,
      pct: cap <= 0 ? 0 : Math.min(999, (value / cap) * 100),
    });
  }
  return out;
}

/** @deprecated Prefer calendarYearBars — kept for callers expecting hours-only. */
export function calendarYearHourBars(
  project: Project,
  assignments: Assignment[],
  asOf: Date = new Date(),
): MonthBurnBar[] {
  return calendarYearBars(
    project,
    assignments,
    [],
    asOf.getFullYear(),
    asOf,
  );
}

/** Hours for one assignment occurrence overlapping [fromKey, toKey] inclusive. */
function occurrenceHoursInRange(
  occ: { start_date: string; end_date: string; hours_per_day: number },
  fromKey: string,
  toKey: string,
): number {
  if (occ.end_date < fromKey || occ.start_date > toKey) return 0;
  const days = workingDaysBetween(occ.start_date, occ.end_date).filter(
    (d) => d >= fromKey && d <= toKey,
  );
  return days.length * occ.hours_per_day;
}

/**
 * Confirmed schedule hours for a project overlapping [fromKey, toKey].
 * Expands weekly recurrence across the range.
 */
export function projectHoursInDateRange(
  projectId: string,
  assignments: Assignment[],
  fromKey: string,
  toKey: string,
  includeTentative = false,
): number {
  if (toKey < fromKey) return 0;
  return assignments
    .filter(
      (a) =>
        a.project_id === projectId &&
        (includeTentative || a.status === "confirmed"),
    )
    .reduce((sum, a) => {
      const occs = expandAssignmentInRange(a, fromKey, toKey);
      return (
        sum +
        occs.reduce(
          (s, occ) => s + occurrenceHoursInRange(occ, fromKey, toKey),
          0,
        )
      );
    }, 0);
}

/** Labor cost $ for confirmed schedule hours in [fromKey, toKey]. */
export function projectBillableAmountInDateRange(
  projectId: string,
  assignments: Assignment[],
  people: Person[],
  fromKey: string,
  toKey: string,
  includeTentative = false,
  settings: OrganizationSettings = DEFAULT_ORG_BUDGET_SETTINGS,
): number {
  if (toKey < fromKey) return 0;
  const byId = new Map(people.map((p) => [p.id, p]));
  let sum = 0;
  for (const a of assignments) {
    if (a.project_id !== projectId) continue;
    if (!includeTentative && a.status !== "confirmed") continue;
    const rate = effectiveCostRate(byId.get(a.person_id), settings);
    for (const occ of expandAssignmentInRange(a, fromKey, toKey)) {
      sum += occurrenceHoursInRange(occ, fromKey, toKey) * rate;
    }
  }
  return sum;
}

export interface ProjectHoursForecast {
  hoursUsedToDate: number;
  hoursFuturePlanned: number;
  hoursTotalPlanned: number;
  /** Null when budget_mode is none (no hours remaining concept). */
  hoursRemaining: number | null;
  /** True when used + future exceeds hours budget (or $→hours equiv). */
  overBudget: boolean;
  mode: Project["budget_mode"];
}

function projectRateForHoursBudget(
  project: Project,
  settings: OrganizationSettings = DEFAULT_ORG_BUDGET_SETTINGS,
): number {
  return effectiveProjectBillRate(project, settings);
}

/** Schedule hours used (≤ today) vs future, plus remaining vs project budget. */
export function projectHoursForecast(
  project: Project,
  assignments: Assignment[],
  people: Person[],
  asOf: Date = new Date(),
  settings: OrganizationSettings = DEFAULT_ORG_BUDGET_SETTINGS,
): ProjectHoursForecast {
  const mode = normalizeBudgetMode(
    project.budget_mode,
    project.budget_hours,
    project.budget_amount,
  );
  const todayKey = toDateKey(asOf);
  const tomorrow = new Date(asOf);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = toDateKey(tomorrow);

  let rangeStart = "1970-01-01";
  let rangeEnd = "2099-12-31";
  if (isMonthlyRetainerBudget(project)) {
    const start = startOfMonth(asOf);
    const end = endOfMonth(asOf);
    rangeStart = toDateKey(start);
    rangeEnd = toDateKey(end);
  }

  const usedEnd = todayKey < rangeEnd ? todayKey : rangeEnd;
  const futureStart = tomorrowKey > rangeStart ? tomorrowKey : rangeStart;

  const hoursUsedToDate =
    usedEnd >= rangeStart
      ? projectHoursInDateRange(
          project.id,
          assignments,
          rangeStart,
          usedEnd,
        )
      : 0;
  const hoursFuturePlanned =
    futureStart <= rangeEnd
      ? projectHoursInDateRange(
          project.id,
          assignments,
          futureStart,
          rangeEnd,
        )
      : 0;
  const hoursTotalPlanned = hoursUsedToDate + hoursFuturePlanned;

  let hoursRemaining: number | null = null;
  let overBudget = false;

  if (mode === "hours") {
    const totalHours = project.budget_hours ?? 0;
    hoursRemaining = totalHours - hoursTotalPlanned;
    overBudget = hoursTotalPlanned > totalHours && totalHours > 0;
  } else if (mode === "amount") {
    const totalAmount = project.budget_amount ?? 0;
    const usedAmount = (() => {
      const byId = new Map(people.map((p) => [p.id, p]));
      let sum = 0;
      for (const a of assignments) {
        if (a.project_id !== project.id || a.status !== "confirmed") continue;
        const rate = effectiveCostRate(byId.get(a.person_id), settings);
        const from = rangeStart;
        const to = usedEnd;
        if (to < from) continue;
        for (const occ of expandAssignmentInRange(a, from, to)) {
          sum += occurrenceHoursInRange(occ, from, to) * rate;
        }
      }
      return sum;
    })();
    const futureAmount = (() => {
      const byId = new Map(people.map((p) => [p.id, p]));
      let sum = 0;
      for (const a of assignments) {
        if (a.project_id !== project.id || a.status !== "confirmed") continue;
        const rate = effectiveCostRate(byId.get(a.person_id), settings);
        if (futureStart > rangeEnd) continue;
        for (const occ of expandAssignmentInRange(a, futureStart, rangeEnd)) {
          sum += occurrenceHoursInRange(occ, futureStart, rangeEnd) * rate;
        }
      }
      return sum;
    })();
    const remainingAmount = totalAmount - usedAmount - futureAmount;
    const rate = projectRateForHoursBudget(project, settings);
    hoursRemaining = rate > 0 ? remainingAmount / rate : null;
    overBudget = usedAmount + futureAmount > totalAmount && totalAmount > 0;
  }

  return {
    hoursUsedToDate,
    hoursFuturePlanned,
    hoursTotalPlanned,
    hoursRemaining,
    overBudget,
    mode,
  };
}

export interface CumulativeBurnPoint {
  key: string;
  label: string;
  /** Cumulative hours through end of this month (used portion only up to today). */
  cumulativeUsed: number;
  /** Cumulative hours through end of this month including all planned. */
  cumulativePlanned: number;
  /** Whether this month is entirely in the future (dashed segment). */
  isFuture: boolean;
}

export interface WeeklyProgressPoint {
  key: string;
  /** Week start (Mon) date key. */
  weekStartKey: string;
  weekEndKey: string;
  /** Short label for tooltips. */
  label: string;
  /** Hours scheduled in this week only. */
  weekHours: number;
  /** Billable $ scheduled in this week only. */
  weekAmount: number;
  /** Cumulative used through min(week end, today). */
  cumulativeUsed: number;
  /** Cumulative planned through week end. */
  cumulativePlanned: number;
  /** Cumulative billable $ used through min(week end, today). */
  cumulativeUsedAmount: number;
  /** Cumulative billable $ planned through week end. */
  cumulativePlannedAmount: number;
  isCurrentWeek: boolean;
  /** Week starts after today — entirely future. */
  isFuture: boolean;
}

export function projectDateSpan(
  project: Project,
  assignments: Assignment[],
): { startKey: string; endKey: string } | null {
  if (project.start_date && project.end_date) {
    return { startKey: project.start_date, endKey: project.end_date };
  }
  let min: string | null = null;
  let max: string | null = null;
  for (const a of assignments) {
    if (a.project_id !== project.id || a.status !== "confirmed") continue;
    // Expand weekly a bit to find span
    const endHorizon =
      a.recurrence === "weekly"
        ? a.recurrence_end_date ??
          toDateKey(
            new Date(
              parseISOSafe(a.start_date).getTime() +
                52 * 7 * 24 * 60 * 60 * 1000,
            ),
          )
        : a.end_date;
    const start = a.start_date;
    const end = endHorizon;
    if (!min || start < min) min = start;
    if (!max || end > max) max = end;
  }
  if (!min || !max) return null;
  return {
    startKey: project.start_date ?? min,
    endKey: project.end_date ?? max,
  };
}

function parseISOSafe(key: string): Date {
  return new Date(`${key}T12:00:00`);
}

/** Month-by-month cumulative used vs planned hours for non-retainer charts. */
export function cumulativeHoursSeries(
  project: Project,
  assignments: Assignment[],
  asOf: Date = new Date(),
): CumulativeBurnPoint[] {
  const span = projectDateSpan(project, assignments);
  if (!span) return [];
  const todayKey = toDateKey(asOf);
  const start = startOfMonth(parseISOSafe(span.startKey));
  const end = startOfMonth(parseISOSafe(span.endKey));
  const points: CumulativeBurnPoint[] = [];
  let cursor = new Date(start);
  let cumUsed = 0;
  let cumPlanned = 0;

  while (cursor <= end) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const monthStartKey = toDateKey(startOfMonth(cursor));
    const monthEndKey = toDateKey(endOfMonth(cursor));
    const rangeFrom =
      monthStartKey < span.startKey ? span.startKey : monthStartKey;
    const rangeTo = monthEndKey > span.endKey ? span.endKey : monthEndKey;

    const monthPlanned = projectHoursInDateRange(
      project.id,
      assignments,
      rangeFrom,
      rangeTo,
    );
    cumPlanned += monthPlanned;

    let monthUsed = 0;
    if (rangeFrom <= todayKey) {
      const usedTo = rangeTo < todayKey ? rangeTo : todayKey;
      if (usedTo >= rangeFrom) {
        monthUsed = projectHoursInDateRange(
          project.id,
          assignments,
          rangeFrom,
          usedTo,
        );
      }
    }
    cumUsed += monthUsed;

    points.push({
      key: format(cursor, "yyyy-MM"),
      label: format(cursor, "MMM yyyy"),
      cumulativeUsed: cumUsed,
      cumulativePlanned: cumPlanned,
      isFuture: monthStartKey > todayKey,
    });

    cursor = new Date(y, m + 1, 1);
  }
  return points;
}

/** Week-by-week cumulative used vs planned for project progress charts. */
export function weeklyProgressSeries(
  project: Project,
  assignments: Assignment[],
  asOf: Date = new Date(),
  people: Person[] = [],
  projectMembers: ProjectMember[] = [],
): WeeklyProgressPoint[] {
  const span = projectDateSpan(project, assignments);
  if (!span) return [];
  const todayKey = toDateKey(asOf);
  const start = weekStart(parseISOSafe(span.startKey));
  const end = weekStart(parseISOSafe(span.endKey));
  const currentWeekStart = toDateKey(weekStart(asOf));
  const points: WeeklyProgressPoint[] = [];
  let cursor = new Date(start);
  let cumUsed = 0;
  let cumPlanned = 0;
  let cumUsedAmount = 0;
  let cumPlannedAmount = 0;
  const trackAmount = people.length > 0;
  let guard = 0;

  const hasContractorTerms = projectMembers.some(
    (m) => m.project_id === project.id,
  );
  const classified = hasContractorTerms
    ? classifyProjectPeople(
        project.id,
        assignments,
        people,
        projectMembers,
      )
    : null;
  const internalIds = classified?.internalIds ?? null;

  function weekHoursInRange(from: string, to: string): number {
    if (to < from) return 0;
    if (internalIds) {
      return projectHoursInDateRangeForPeople(
        project.id,
        assignments,
        from,
        to,
        internalIds,
      );
    }
    return projectHoursInDateRange(project.id, assignments, from, to);
  }

  function weekAmountInRange(from: string, to: string): number {
    if (to < from) return 0;
    if (internalIds) {
      return projectBillableAmountInDateRangeForPeople(
        project.id,
        assignments,
        people,
        from,
        to,
        internalIds,
      );
    }
    return projectBillableAmountInDateRange(
      project.id,
      assignments,
      people,
      from,
      to,
    );
  }

  while (cursor <= end && guard < 260) {
    guard += 1;
    const ws = weekStart(cursor);
    const we = weekEnd(ws);
    const weekStartKey = toDateKey(ws);
    const weekEndKey = toDateKey(we);
    const rangeFrom =
      weekStartKey < span.startKey ? span.startKey : weekStartKey;
    const rangeTo = weekEndKey > span.endKey ? span.endKey : weekEndKey;

    const weekHours =
      rangeTo >= rangeFrom
        ? weekHoursInRange(rangeFrom, rangeTo)
        : 0;
    cumPlanned += weekHours;

    let weekUsed = 0;
    if (rangeFrom <= todayKey && rangeTo >= rangeFrom) {
      const usedTo = rangeTo < todayKey ? rangeTo : todayKey;
      if (usedTo >= rangeFrom) {
        weekUsed = weekHoursInRange(rangeFrom, usedTo);
      }
    }
    cumUsed += weekUsed;

    let weekAmount = 0;
    let weekUsedAmount = 0;
    if (trackAmount && rangeTo >= rangeFrom) {
      weekAmount = weekAmountInRange(rangeFrom, rangeTo);
      cumPlannedAmount += weekAmount;
      if (rangeFrom <= todayKey && rangeTo >= rangeFrom) {
        const usedTo = rangeTo < todayKey ? rangeTo : todayKey;
        if (usedTo >= rangeFrom) {
          weekUsedAmount = weekAmountInRange(rangeFrom, usedTo);
        }
      }
      cumUsedAmount += weekUsedAmount;
    }

    points.push({
      key: weekStartKey,
      weekStartKey,
      weekEndKey,
      label: format(ws, "MMM d"),
      weekHours,
      weekAmount,
      cumulativeUsed: cumUsed,
      cumulativePlanned: cumPlanned,
      cumulativeUsedAmount: cumUsedAmount,
      cumulativePlannedAmount: cumPlannedAmount,
      isCurrentWeek: weekStartKey === currentWeekStart,
      isFuture: weekStartKey > todayKey,
    });

    cursor = addWeeks(ws, 1);
  }
  return points;
}
