import type {
  BudgetBurn,
  OrganizationSettings,
  Person,
  Project,
  ProjectContractorExpense,
  ProjectMember,
} from "@/lib/types";
import type { CurrencyCode } from "@/lib/types";
import { effectiveCostRate } from "@/lib/domain/org-settings";

export type { CurrencyCode };

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return value === "usd" || value === "cad";
}

export function parseCurrency(
  value: unknown,
): CurrencyCode | null {
  if (value === "usd" || value === "cad") return value;
  return null;
}

/** 1 USD = usdToCad CAD. */
export function convertAmount(
  amount: number,
  from: CurrencyCode | null | undefined,
  to: CurrencyCode | null | undefined,
  usdToCad: number,
  enabled = true,
): number {
  if (!enabled || !Number.isFinite(amount) || amount === 0) return amount;
  const src = from ?? "usd";
  const dest = to ?? "usd";
  if (src === dest) return amount;
  const rate = usdToCad > 0 ? usdToCad : 1;
  if (src === "usd" && dest === "cad") return amount * rate;
  return amount / rate;
}

export function personCurrency(
  person: Pick<Person, "currency"> | null | undefined,
  enabled: boolean,
): CurrencyCode {
  if (!enabled) return "usd";
  return person?.currency ?? "usd";
}

export function projectCurrency(
  project: Pick<Project, "currency"> | null | undefined,
  enabled: boolean,
): CurrencyCode {
  if (!enabled) return "usd";
  return project?.currency ?? "usd";
}

/**
 * Hours × cost rate in `to` currency.
 * Org default cost rate is USD when the person has no native rate.
 */
export function costForHours(
  person: Person | null | undefined,
  hours: number,
  to: CurrencyCode,
  settings: OrganizationSettings,
): number {
  if (hours === 0) return 0;
  const nativeRate = person?.cost_rate ?? 0;
  const rate =
    nativeRate > 0 ? nativeRate : effectiveCostRate(person, settings);
  const from: CurrencyCode =
    nativeRate > 0
      ? personCurrency(person, settings.currency_enabled)
      : "usd";
  return convertAmount(
    hours * rate,
    from,
    to,
    settings.usd_to_cad_rate,
    settings.currency_enabled,
  );
}

export function amountToProjectCurrency(
  amount: number,
  from: CurrencyCode | null | undefined,
  project: Pick<Project, "currency">,
  settings: OrganizationSettings,
): number {
  return convertAmount(
    amount,
    settings.currency_enabled ? (from ?? "usd") : "usd",
    projectCurrency(project, settings.currency_enabled),
    settings.usd_to_cad_rate,
    settings.currency_enabled,
  );
}

export function personAmountToProject(
  amount: number,
  person: Pick<Person, "currency"> | null | undefined,
  project: Pick<Project, "currency">,
  settings: OrganizationSettings,
): number {
  return amountToProjectCurrency(
    amount,
    personCurrency(person, settings.currency_enabled),
    project,
    settings,
  );
}

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function convertBurnToCurrency(
  burn: BudgetBurn,
  from: CurrencyCode,
  to: CurrencyCode,
  settings: OrganizationSettings,
): BudgetBurn {
  const c = (n: number) =>
    convertAmount(n, from, to, settings.usd_to_cad_rate, settings.currency_enabled);
  return {
    ...burn,
    usedAmount: c(burn.usedAmount),
    futureAmount: c(burn.futureAmount),
    plannedAmount: c(burn.plannedAmount),
    totalAmount: burn.totalAmount == null ? null : c(burn.totalAmount),
    remainingAmount:
      burn.remainingAmount == null ? null : c(burn.remainingAmount),
    amountOverBy: c(burn.amountOverBy),
    contractorAmount: c(burn.contractorAmount),
    contractorUsedAmount: c(burn.contractorUsedAmount),
    contractorFutureAmount: c(burn.contractorFutureAmount),
  };
}

export function stampPeopleAndProjectsUsd<T extends {
  people: Person[];
  projects: Project[];
}>(slices: T): T {
  return {
    ...slices,
    people: slices.people.map((p) => ({ ...p, currency: "usd" as const })),
    projects: slices.projects.map((p) => ({ ...p, currency: "usd" as const })),
  };
}

export function convertWorkspaceToCurrency<T extends {
  people: Person[];
  projects: Project[];
  project_members: ProjectMember[];
  project_contractor_expenses: ProjectContractorExpense[];
  organization_settings: OrganizationSettings;
}>(slices: T, saveAs: CurrencyCode): T {
  const rate = slices.organization_settings.usd_to_cad_rate;
  const peopleById = new Map(slices.people.map((p) => [p.id, p]));
  const people = slices.people.map((p) => ({
    ...p,
    cost_rate: roundMoney(
      convertAmount(p.cost_rate, p.currency ?? "usd", saveAs, rate, true),
    ),
    currency: null,
  }));
  const projects = slices.projects.map((p) => ({
    ...p,
    budget_amount:
      p.budget_amount == null
        ? null
        : roundMoney(
            convertAmount(p.budget_amount, p.currency ?? "usd", saveAs, rate, true),
          ),
    bill_rate:
      p.bill_rate == null
        ? null
        : roundMoney(
            convertAmount(p.bill_rate, p.currency ?? "usd", saveAs, rate, true),
          ),
    currency: null,
  }));
  const project_members = slices.project_members.map((m) => {
    const person = peopleById.get(m.person_id);
    const fee = m.contractor_fixed_fee;
    return {
      ...m,
      contractor_fixed_fee:
        fee == null
          ? null
          : roundMoney(
              convertAmount(
                fee,
                person?.currency ?? "usd",
                saveAs,
                rate,
                true,
              ),
            ),
    };
  });
  const project_contractor_expenses = slices.project_contractor_expenses.map(
    (e) => {
      if (!(e.amount > 0)) return e;
      const person = peopleById.get(e.person_id);
      return {
        ...e,
        amount: roundMoney(
          convertAmount(e.amount, person?.currency ?? "usd", saveAs, rate, true),
        ),
      };
    },
  );
  const settings = slices.organization_settings;
  return {
    ...slices,
    people,
    projects,
    project_members,
    project_contractor_expenses,
    organization_settings: {
      ...settings,
      default_cost_rate: roundMoney(
        convertAmount(settings.default_cost_rate, "usd", saveAs, rate, true),
      ),
      default_bill_rate: roundMoney(
        convertAmount(settings.default_bill_rate, "usd", saveAs, rate, true),
      ),
      currency_enabled: false,
    },
  };
}

export function convertPersonFeesAndExpenses(
  members: ProjectMember[],
  expenses: ProjectContractorExpense[],
  personId: string,
  from: CurrencyCode,
  to: CurrencyCode,
  usdToCad: number,
): { members: ProjectMember[]; expenses: ProjectContractorExpense[] } {
  if (from === to) return { members, expenses };
  return {
    members: members.map((m) => {
      if (m.person_id !== personId || m.contractor_fixed_fee == null) return m;
      return {
        ...m,
        contractor_fixed_fee: roundMoney(
          convertAmount(m.contractor_fixed_fee, from, to, usdToCad, true),
        ),
      };
    }),
    expenses: expenses.map((e) => {
      if (e.person_id !== personId || !(e.amount > 0)) return e;
      return {
        ...e,
        amount: roundMoney(convertAmount(e.amount, from, to, usdToCad, true)),
      };
    }),
  };
}
