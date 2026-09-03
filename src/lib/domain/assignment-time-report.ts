import { endOfMonth, format, startOfMonth } from "date-fns";
import {
  contractorExpenseAppliesInMonth,
  contractorExpenseEntryHours,
  formatHours,
  isMonthlyRetainerBudget,
} from "@/lib/domain/budget";
import { parseDateKey, toDateKey, workingDaysBetween } from "@/lib/domain/dates";
import { expandAssignmentInRange } from "@/lib/domain/recurrence";
import type {
  Assignment,
  AssignmentBoundTask,
  Person,
  Project,
  ProjectContractorExpense,
  Task,
} from "@/lib/types";

export type AssignmentTimeStatus = "completed" | "planned";

export type AssignmentTimeRowKind =
  | "assignment"
  | "contractor"
  | "project_management"
  | "total";

export type AssignmentTimeRow = {
  id: string;
  kind: AssignmentTimeRowKind;
  startDate: string;
  endDate: string;
  personId: string | null;
  personName: string;
  /** Bound task titles, or a single label like "Production Time". */
  taskLabels: string[];
  status: AssignmentTimeStatus;
  hours: number;
};

export type AssignmentTimeMonthSection = {
  year: number;
  monthIndex: number;
  monthKey: string;
  monthLabel: string;
  rows: AssignmentTimeRow[];
  pmHours: number;
  totalHours: number;
};

export type AssignmentTimeReportInput = {
  project: Project;
  assignments: Assignment[];
  boundTasks: AssignmentBoundTask[];
  tasks: Task[];
  people: Person[];
  contractorExpenses: ProjectContractorExpense[];
  todayKey: string;
  /** Inclusive months to report (calendar months). */
  months: Array<{ year: number; monthIndex: number }>;
};

/** Whether Assignment Time reporting is enabled for this project. */
export function showAssignmentTimeReport(project: Project): boolean {
  return (
    Boolean(project.assignment_time_reporting) &&
    isMonthlyRetainerBudget(project) &&
    project.budget_mode === "hours"
  );
}

export function assignmentTimeStatus(
  sliceEndDate: string,
  todayKey: string,
): AssignmentTimeStatus {
  return sliceEndDate < todayKey ? "completed" : "planned";
}

export function formatAssignmentTimeDateRange(
  startDate: string,
  endDate: string,
): string {
  try {
    const start = format(parseDateKey(startDate), "MMM d, yyyy");
    if (startDate === endDate) return start;
    const end = format(parseDateKey(endDate), "MMM d, yyyy");
    return `${start} – ${end}`;
  } catch {
    return startDate === endDate ? startDate : `${startDate} – ${endDate}`;
  }
}

function monthBounds(year: number, monthIndex: number): {
  startKey: string;
  endKey: string;
  monthKey: string;
  monthLabel: string;
} {
  const start = startOfMonth(new Date(year, monthIndex, 1));
  const end = endOfMonth(start);
  return {
    startKey: toDateKey(start),
    endKey: toDateKey(end),
    monthKey: toDateKey(start),
    monthLabel: format(start, "MMMM yyyy"),
  };
}

function hoursInMonthSlice(
  occStart: string,
  occEnd: string,
  hoursPerDay: number,
  monthStart: string,
  monthEnd: string,
): { hours: number; startDate: string; endDate: string } {
  const days = workingDaysBetween(occStart, occEnd).filter(
    (d) => d >= monthStart && d <= monthEnd,
  );
  if (days.length === 0) {
    return { hours: 0, startDate: monthStart, endDate: monthStart };
  }
  return {
    hours: days.length * hoursPerDay,
    startDate: days[0]!,
    endDate: days[days.length - 1]!,
  };
}

function boundTaskTitlesForAssignment(
  assignmentId: string,
  boundTasks: AssignmentBoundTask[],
  tasksById: Map<string, Task>,
): string[] {
  return boundTasks
    .filter((b) => b.assignment_id === assignmentId)
    .sort((a, b) => a.sort_order - b.sort_order || a.task_id.localeCompare(b.task_id))
    .map((b) => tasksById.get(b.task_id)?.title?.trim() || "Untitled task");
}

/**
 * Build Assignment Time sections for the given months.
 * Returns [] when the project flag / budget shape does not qualify.
 */
export function buildAssignmentTimeReport(
  input: AssignmentTimeReportInput,
): AssignmentTimeMonthSection[] {
  const {
    project,
    assignments,
    boundTasks,
    tasks,
    people,
    contractorExpenses,
    todayKey,
    months,
  } = input;

  if (!showAssignmentTimeReport(project)) return [];

  const peopleById = new Map(people.map((p) => [p.id, p]));
  const tasksById = new Map(tasks.map((t) => [t.id, t]));
  const projectAssignments = assignments.filter(
    (a) => a.project_id === project.id && a.status === "confirmed",
  );
  const projectExpenses = contractorExpenses.filter(
    (e) => e.project_id === project.id,
  );
  const pmId = project.manager_person_id;

  return months.map(({ year, monthIndex }) => {
    const { startKey, endKey, monthKey, monthLabel } = monthBounds(
      year,
      monthIndex,
    );
    const bodyRows: AssignmentTimeRow[] = [];
    let pmHours = 0;
    const scheduledPersonIds = new Set<string>();

    for (const assignment of projectAssignments) {
      const titles = boundTaskTitlesForAssignment(
        assignment.id,
        boundTasks,
        tasksById,
      );
      const isPmUnbound =
        Boolean(pmId) &&
        assignment.person_id === pmId &&
        titles.length === 0;

      const occs = expandAssignmentInRange(
        assignment,
        startKey,
        endKey,
        project.end_date,
      );
      for (const occ of occs) {
        const slice = hoursInMonthSlice(
          occ.start_date,
          occ.end_date,
          occ.hours_per_day,
          startKey,
          endKey,
        );
        if (slice.hours <= 0) continue;

        scheduledPersonIds.add(assignment.person_id);

        if (isPmUnbound) {
          pmHours += slice.hours;
          continue;
        }

        const person = peopleById.get(assignment.person_id);
        bodyRows.push({
          id: `asg:${assignment.id}:${slice.startDate}:${slice.endDate}`,
          kind: "assignment",
          startDate: slice.startDate,
          endDate: slice.endDate,
          personId: assignment.person_id,
          personName: person?.name?.trim() || "Unknown",
          taskLabels: titles.length > 0 ? titles : ["Production Time"],
          status: assignmentTimeStatus(slice.endDate, todayKey),
          hours: slice.hours,
        });
      }
    }

    for (const expense of projectExpenses) {
      if (!contractorExpenseAppliesInMonth(project, expense, monthKey)) {
        continue;
      }
      if (scheduledPersonIds.has(expense.person_id)) continue;
      const person = peopleById.get(expense.person_id);
      const hours = contractorExpenseEntryHours(expense, person);
      if (hours <= 0) continue;
      const note = expense.notes?.trim();
      bodyRows.push({
        id: `exp:${expense.id}:${monthKey}`,
        kind: "contractor",
        startDate: startKey,
        endDate: endKey,
        personId: expense.person_id,
        personName: person?.name?.trim() || "Contractor",
        taskLabels: note ? [note] : [],
        status: assignmentTimeStatus(endKey, todayKey),
        hours,
      });
    }

    bodyRows.sort((a, b) => {
      if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate);
      if (a.endDate !== b.endDate) return a.endDate.localeCompare(b.endDate);
      if (a.kind !== b.kind) {
        // Contractors after schedule assignments within the same dates.
        if (a.kind === "contractor") return 1;
        if (b.kind === "contractor") return -1;
      }
      return a.personName.localeCompare(b.personName);
    });

    const rows: AssignmentTimeRow[] = [...bodyRows];

    if (pmHours > 0) {
      const pmPerson = pmId ? peopleById.get(pmId) : undefined;
      rows.push({
        id: `pm:${monthKey}`,
        kind: "project_management",
        startDate: startKey,
        endDate: endKey,
        personId: pmId,
        personName: pmPerson?.name?.trim() || "Project Manager",
        taskLabels: ["Project Management time"],
        status: assignmentTimeStatus(endKey, todayKey),
        hours: pmHours,
      });
    }

    const totalHours =
      bodyRows.reduce((sum, r) => sum + r.hours, 0) + pmHours;

    rows.push({
      id: `total:${monthKey}`,
      kind: "total",
      startDate: startKey,
      endDate: endKey,
      personId: null,
      personName: "",
      taskLabels: [],
      status: assignmentTimeStatus(endKey, todayKey),
      hours: totalHours,
    });

    return {
      year,
      monthIndex,
      monthKey,
      monthLabel,
      rows,
      pmHours,
      totalHours,
    };
  });
}

/** Months between project start and end (inclusive), calendar months. */
export function assignmentTimeTermMonths(
  project: Pick<Project, "start_date" | "end_date">,
): Array<{ year: number; monthIndex: number }> {
  if (!project.start_date || !project.end_date) return [];
  const start = startOfMonth(parseDateKey(project.start_date));
  const end = startOfMonth(parseDateKey(project.end_date));
  if (end < start) return [];
  const out: Array<{ year: number; monthIndex: number }> = [];
  let cur = start;
  while (cur <= end) {
    out.push({ year: cur.getFullYear(), monthIndex: cur.getMonth() });
    cur = startOfMonth(
      new Date(cur.getFullYear(), cur.getMonth() + 1, 1),
    );
  }
  return out;
}

export { formatHours as formatAssignmentTimeHours };
