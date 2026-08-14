import type {
  ContractorMode,
  OrganizationSettings,
  Person,
  ProjectMember,
} from "@/lib/types";
import {
  DEFAULT_ORG_BUDGET_SETTINGS,
  effectiveCostRate,
} from "@/lib/domain/org-settings";

/** People who appear on the schedule grid. */
export function scheduleVisiblePeople(people: Person[]): Person[] {
  return people.filter((p) => !p.hide_from_schedule);
}

/** People included in utilization / capacity reporting. */
export function utilizationVisiblePeople(people: Person[]): Person[] {
  return people.filter((p) => !p.hide_from_utilization);
}

/** Both schedule and utilization are hidden (capacity treated as zero). */
export function isFullyHiddenFromPlanning(person: Person): boolean {
  return person.hide_from_schedule && person.hide_from_utilization;
}

/**
 * Contractor visible on schedule + utilization: tag only; burns like staff;
 * no per-project Fixed Fee / Hours terms.
 */
export function isFullTimeStyleContractor(person: Person): boolean {
  return (
    person.is_contractor &&
    !person.hide_from_schedule &&
    !person.hide_from_utilization
  );
}

/**
 * Contractor with at least one planning hide flag: project-basis terms +
 * green budget treatment.
 */
export function isProjectBasisContractor(person: Person): boolean {
  return (
    person.is_contractor &&
    (person.hide_from_schedule || person.hide_from_utilization)
  );
}

/** Fixed-fee or hours commitment (excluded from schedule burn; counted as a commit). */
export function isCommitContractor(
  person: Person,
  member: Pick<ProjectMember, "contractor_mode"> | null | undefined,
): boolean {
  if (!isProjectBasisContractor(person)) return false;
  const mode =
    member?.contractor_mode ??
    (person.hide_from_schedule ? "fixed_fee" : "scheduled");
  return mode === "fixed_fee" || mode === "hours";
}

type CostSettings = Pick<OrganizationSettings, "default_cost_rate">;

/** Cost rate with org default for Fixed Fee → hours conversion (no bill rate). */
export function contractorProfileRate(
  person: Pick<Person, "cost_rate">,
  settings: CostSettings = DEFAULT_ORG_BUDGET_SETTINGS,
): number {
  return effectiveCostRate(person, settings);
}

export function contractorHoursFromFixedFee(
  fixedFee: number,
  person: Pick<Person, "cost_rate">,
  settings: CostSettings = DEFAULT_ORG_BUDGET_SETTINGS,
): number {
  const rate = contractorProfileRate(person, settings);
  if (rate <= 0 || fixedFee <= 0) return 0;
  return fixedFee / rate;
}

export function contractorAmountFromHours(
  hours: number,
  person: Pick<Person, "cost_rate">,
  settings: CostSettings = DEFAULT_ORG_BUDGET_SETTINGS,
): number {
  const rate = contractorProfileRate(person, settings);
  if (rate <= 0 || hours <= 0) return 0;
  return hours * rate;
}

/** Resolved commitment for a project-basis contractor roster row. */
export function contractorCommitted(
  person: Person,
  member: Pick<
    ProjectMember,
    "contractor_mode" | "contractor_fixed_fee" | "contractor_hours"
  > | null | undefined,
  opts?: {
    scheduledHours?: number;
    scheduledAmount?: number;
    settings?: CostSettings;
  },
): { mode: ContractorMode | null; hours: number; amount: number } {
  const settings = opts?.settings ?? DEFAULT_ORG_BUDGET_SETTINGS;
  if (!isProjectBasisContractor(person)) {
    return { mode: null, hours: 0, amount: 0 };
  }
  const mode = member?.contractor_mode ?? null;
  if (!mode) return { mode: null, hours: 0, amount: 0 };

  if (mode === "fixed_fee") {
    const amount = member?.contractor_fixed_fee ?? 0;
    return {
      mode,
      amount,
      hours: contractorHoursFromFixedFee(amount, person, settings),
    };
  }
  if (mode === "hours") {
    const hours = member?.contractor_hours ?? 0;
    return {
      mode,
      hours,
      amount: contractorAmountFromHours(hours, person, settings),
    };
  }
  // scheduled
  return {
    mode,
    hours: opts?.scheduledHours ?? 0,
    amount: opts?.scheduledAmount ?? 0,
  };
}

export function sortPeopleContractorsLast(people: Person[]): Person[] {
  return [...people].sort((a, b) => {
    if (a.is_contractor !== b.is_contractor) {
      return a.is_contractor ? 1 : -1;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

export type ContractorTerms = Pick<
  ProjectMember,
  "contractor_mode" | "contractor_fixed_fee" | "contractor_hours"
>;

export function contractorTermsFromProjectMembers(
  projectId: string,
  projectMembers: ProjectMember[],
): Record<string, ContractorTerms> {
  const terms: Record<string, ContractorTerms> = {};
  for (const m of projectMembers) {
    if (m.project_id !== projectId) continue;
    terms[m.person_id] = {
      contractor_mode: m.contractor_mode,
      contractor_fixed_fee: m.contractor_fixed_fee,
      contractor_hours: m.contractor_hours,
    };
  }
  return terms;
}

/** Default mode when a project-basis contractor joins the roster. */
export function defaultContractorTermsForPerson(person: Person): ContractorTerms {
  if (!isProjectBasisContractor(person)) {
    return {
      contractor_mode: null,
      contractor_fixed_fee: null,
      contractor_hours: null,
    };
  }
  return {
    contractor_mode: person.hide_from_schedule ? "fixed_fee" : "scheduled",
    contractor_fixed_fee: null,
    contractor_hours: null,
  };
}

export function buildProjectMembersPayload(
  memberIds: string[],
  contractorTerms: Record<string, ContractorTerms>,
  people: Person[],
): Array<{
  person_id: string;
  contractor_mode: ContractorMode | null;
  contractor_fixed_fee: number | null;
  contractor_hours: number | null;
}> {
  const peopleById = new Map(people.map((p) => [p.id, p]));
  return memberIds.map((person_id) => {
    const person = peopleById.get(person_id);
    if (!person || !isProjectBasisContractor(person)) {
      return {
        person_id,
        contractor_mode: null,
        contractor_fixed_fee: null,
        contractor_hours: null,
      };
    }
    const terms = contractorTerms[person_id];
    const mode = terms?.contractor_mode ?? null;
    if (mode === "hours") {
      return {
        person_id,
        contractor_mode: "hours",
        contractor_fixed_fee: null,
        contractor_hours: terms?.contractor_hours ?? null,
      };
    }
    if (mode === "scheduled") {
      return {
        person_id,
        contractor_mode: "scheduled",
        contractor_fixed_fee: null,
        contractor_hours: null,
      };
    }
    if (mode === "fixed_fee") {
      return {
        person_id,
        contractor_mode: "fixed_fee",
        contractor_fixed_fee: terms?.contractor_fixed_fee ?? null,
        contractor_hours: null,
      };
    }
    return {
      person_id,
      contractor_mode: null,
      contractor_fixed_fee: null,
      contractor_hours: null,
    };
  });
}
