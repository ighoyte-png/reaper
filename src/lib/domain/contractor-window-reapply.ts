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
 * Delete dollar expense rows for contractors whose mode is not Dollars
 * (`fixed_fee`). Call after setProjectMembers on save.
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
  const dollarIds = new Set(
    members
      .filter((m) => m.contractor_mode === "fixed_fee")
      .map((m) => m.person_id),
  );
  const toDelete = expenses.filter(
    (e) => e.project_id === projectId && !dollarIds.has(e.person_id),
  );
  for (const row of toDelete) {
    await deleteExpense(row.id);
  }
}
