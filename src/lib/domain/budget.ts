import { addWeeks, endOfMonth, format, startOfMonth } from "date-fns";
import type { Assignment, BudgetBurn, Person, Project } from "@/lib/types";
import { expandAssignmentInRange } from "@/lib/domain/recurrence";
import { assignmentHoursWithRecurrence } from "@/lib/domain/recurrence";
import {
  toDateKey,
  weekEnd,
  weekStart,
  workingDaysBetween,
} from "@/lib/domain/dates";

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
  /** Planned billable $ for the month (hours × bill rates). */
  plannedAmount: number;
  /** Primary bar value (hours or $ depending on chart context). */
  value: number;
  /** Soft monthly cap for over-coloring; 0 means scale against the year’s max. */
  cap: number;
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
      plannedAmount: 0,
      value: plannedHours,
      cap: budgetHours,
      budgetHours,
      pct:
        budgetHours <= 0
          ? 0
          : Math.min(999, (plannedHours / budgetHours) * 100),
    });
  }
  return out;
}

/** Jan–Dec bars for the given calendar year (hours or $ by budget mode). */
export function calendarYearBars(
  project: Project,
  assignments: Assignment[],
  people: Person[],
  asOf: Date = new Date(),
): MonthBurnBar[] {
  const year = asOf.getFullYear();
  const mode = normalizeBudgetMode(
    project.budget_mode,
    project.budget_hours,
    project.budget_amount,
  );
  const monthlyHourCap =
    mode === "hours" && project.budget_monthly_reset
      ? project.budget_hours ?? 0
      : 0;
  const out: MonthBurnBar[] = [];
  for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
    const d = new Date(year, monthIndex, 1);
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
    const value = mode === "amount" ? plannedAmount : plannedHours;
    const cap = mode === "amount" ? 0 : monthlyHourCap;
    out.push({
      key: format(d, "yyyy-MM"),
      label: format(d, "MMM yyyy"),
      year,
      monthIndex,
      plannedHours,
      plannedAmount,
      value,
      cap,
      budgetHours: monthlyHourCap,
      pct:
        cap <= 0 ? 0 : Math.min(999, (value / cap) * 100),
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
  return calendarYearBars(project, assignments, [], asOf);
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

function blendedBillRate(
  projectId: string,
  assignments: Assignment[],
  people: Person[],
): number {
  const byId = new Map(people.map((p) => [p.id, p]));
  let hours = 0;
  let weighted = 0;
  for (const a of assignments) {
    if (a.project_id !== projectId || a.status !== "confirmed") continue;
    const h = assignmentHours(a);
    const rate = byId.get(a.person_id)?.bill_rate ?? 0;
    hours += h;
    weighted += h * rate;
  }
  if (hours <= 0) {
    const rates = people.map((p) => p.bill_rate ?? 0).filter((r) => r > 0);
    if (rates.length === 0) return 0;
    return rates.reduce((s, r) => s + r, 0) / rates.length;
  }
  return weighted / hours;
}

/** Schedule hours used (≤ today) vs future, plus remaining vs project budget. */
export function projectHoursForecast(
  project: Project,
  assignments: Assignment[],
  people: Person[],
  asOf: Date = new Date(),
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
  if (mode === "hours" && project.budget_monthly_reset) {
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
        const rate = byId.get(a.person_id)?.bill_rate ?? 0;
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
        const rate = byId.get(a.person_id)?.bill_rate ?? 0;
        if (futureStart > rangeEnd) continue;
        for (const occ of expandAssignmentInRange(a, futureStart, rangeEnd)) {
          sum += occurrenceHoursInRange(occ, futureStart, rangeEnd) * rate;
        }
      }
      return sum;
    })();
    const remainingAmount = totalAmount - usedAmount - futureAmount;
    const rate = blendedBillRate(project.id, assignments, people);
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
  /** Cumulative used through min(week end, today). */
  cumulativeUsed: number;
  /** Cumulative planned through week end. */
  cumulativePlanned: number;
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
  let guard = 0;

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
        ? projectHoursInDateRange(
            project.id,
            assignments,
            rangeFrom,
            rangeTo,
          )
        : 0;
    cumPlanned += weekHours;

    let weekUsed = 0;
    if (rangeFrom <= todayKey && rangeTo >= rangeFrom) {
      const usedTo = rangeTo < todayKey ? rangeTo : todayKey;
      if (usedTo >= rangeFrom) {
        weekUsed = projectHoursInDateRange(
          project.id,
          assignments,
          rangeFrom,
          usedTo,
        );
      }
    }
    cumUsed += weekUsed;

    points.push({
      key: weekStartKey,
      weekStartKey,
      weekEndKey,
      label: format(ws, "MMM d"),
      weekHours,
      cumulativeUsed: cumUsed,
      cumulativePlanned: cumPlanned,
      isCurrentWeek: weekStartKey === currentWeekStart,
      isFuture: weekStartKey > todayKey,
    });

    cursor = addWeeks(ws, 1);
  }
  return points;
}
