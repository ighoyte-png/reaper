import {
  buildNewYearRepeatExpenseContinuations,
  contractorApplyWindowToastMessage,
  isMonthlyRetainerBudget,
  shouldToastContractorApplyWindow,
} from "@/lib/domain/budget";
import type {
  Project,
  ProjectContractorExpense,
  ProjectMember,
} from "@/lib/types";

/** Upsert new-year Repeat Monthly continuations; return toast text when applicable. */
export async function reapplyContractorWindowsOnProjectSave({
  project,
  members,
  expenses,
  newId,
  upsertExpense,
}: {
  project: Pick<
    Project,
    | "id"
    | "start_date"
    | "end_date"
    | "budget_mode"
    | "budget_hours"
    | "budget_amount"
    | "budget_monthly_reset"
  >;
  members: Array<
    Pick<
      ProjectMember,
      "person_id" | "contractor_mode" | "contractor_hours"
    >
  >;
  expenses: ProjectContractorExpense[];
  newId: (prefix: string) => string;
  upsertExpense: (
    expense: Omit<ProjectContractorExpense, "organization_id"> & {
      organization_id?: string;
    },
  ) => Promise<void>;
}): Promise<string | null> {
  if (!isMonthlyRetainerBudget(project)) return null;

  const projectExpenses = expenses.filter((e) => e.project_id === project.id);
  const rows = buildNewYearRepeatExpenseContinuations(
    project,
    projectExpenses,
    () => newId("pce"),
  );
  for (const row of rows) {
    await upsertExpense(row);
  }
  const merged = [...projectExpenses, ...rows];
  if (
    rows.length > 0 ||
    shouldToastContractorApplyWindow(project, members, merged)
  ) {
    return contractorApplyWindowToastMessage(project);
  }
  return null;
}

/**
 * Delete expense rows that don't match the contractor's saved mode.
 * Dollars keep amount rows; Hours keep hours rows; Schedule clears all.
 */
export async function deleteNonDollarContractorExpensesOnSave({
  projectId,
  members,
  expenses,
  deleteExpense,
}: {
  projectId: string;
  members: Array<Pick<ProjectMember, "person_id" | "contractor_mode">>;
  expenses: ProjectContractorExpense[];
  deleteExpense: (id: string) => Promise<void>;
}): Promise<void> {
  const modeByPerson = new Map(
    members.map((m) => [m.person_id, m.contractor_mode] as const),
  );
  const toDelete = expenses.filter((e) => {
    if (e.project_id !== projectId) return false;
    const mode = modeByPerson.get(e.person_id);
    const isHoursRow = (e.hours ?? 0) > 0;
    const isAmountRow = (e.amount ?? 0) > 0;
    if (mode === "fixed_fee") return isHoursRow;
    if (mode === "hours") return isAmountRow;
    return true;
  });
  for (const row of toDelete) {
    await deleteExpense(row.id);
  }
}
