import { describe, expect, it } from "vitest";
import {
  convertAmount,
  costForHours,
  personAmountToProject,
} from "@/lib/domain/currency";
import { DEFAULT_ORG_BUDGET_SETTINGS } from "@/lib/domain/org-settings";
import type { Person, Project } from "@/lib/types";
import { budgetBurn } from "@/lib/domain/budget";

const cadOn = {
  ...DEFAULT_ORG_BUDGET_SETTINGS,
  currency_enabled: true,
  usd_to_cad_rate: 1.35,
};

function person(partial: Partial<Person> = {}): Person {
  return {
    id: "p1",
    organization_id: "org",
    profile_id: null,
    name: "Pat",
    email: "",
    role_title: "",
    department: "",
    office: "",
    capacity_hours_week: 40,
    cost_rate: 100,
    timezone: "UTC",
    holiday_calendar_id: null,
    avatar_url: null,
    avatar_attachment_id: null,
    hide_from_schedule: false,
    hide_from_utilization: false,
    is_contractor: false,
    avatar_color: null,
    deleted_at: null,
    currency: "usd",
    ...partial,
  };
}

function project(partial: Partial<Project> = {}): Project {
  return {
    id: "proj-1",
    organization_id: "org",
    client_id: null,
    name: "Job",
    slug: "job",
    status: "active",
    priority: 0,
    color: "#336699",
    start_date: null,
    end_date: null,
    budget_mode: "amount",
    budget_hours: null,
    budget_amount: 10000,
    bill_rate: null,
    budget_monthly_reset: false,
    notes: "",
    manager_person_id: null,
    share_enabled: false,
    share_token: null,
    hide_from_public_share: false,
    sandbox_mode: false,
    currency: "usd",
    ...partial,
  };
}

describe("convertAmount", () => {
  it("is identity when disabled or same currency", () => {
    expect(convertAmount(100, "usd", "cad", 1.35, false)).toBe(100);
    expect(convertAmount(100, "usd", "usd", 1.35, true)).toBe(100);
  });

  it("converts USD to CAD and back", () => {
    expect(convertAmount(100, "usd", "cad", 1.35)).toBeCloseTo(135);
    expect(convertAmount(135, "cad", "usd", 1.35)).toBeCloseTo(100);
  });
});

describe("costForHours", () => {
  it("converts a CAD cost rate into a USD project", () => {
    const p = person({ cost_rate: 135, currency: "cad" });
    expect(costForHours(p, 10, "usd", cadOn)).toBeCloseTo(1000);
  });

  it("treats missing person rate as USD org default", () => {
    const p = person({ cost_rate: 0, currency: "cad" });
    const usdDefault = cadOn.default_cost_rate;
    expect(costForHours(p, 2, "cad", cadOn)).toBeCloseTo(usdDefault * 2 * 1.35);
  });
});

describe("budgetBurn mixed contractor currency", () => {
  it("converts a CAD fixed fee into USD project burn", () => {
    const staff = person();
    const contractor = person({
      id: "c1",
      is_contractor: true,
      hide_from_schedule: true,
      hide_from_utilization: true,
      currency: "cad",
      cost_rate: 135,
    });
    const proj = project();
    const burn = budgetBurn(
      proj,
      [],
      [staff, contractor],
      false,
      new Date("2026-08-17T12:00:00"),
      [
        {
          project_id: proj.id,
          person_id: contractor.id,
          organization_id: "org",
          contractor_mode: "fixed_fee",
          contractor_fixed_fee: 1350,
          contractor_hours: null,
        },
      ],
      [],
      cadOn,
    );
    expect(burn.plannedAmount).toBeCloseTo(1000);
    expect(burn.contractorAmount).toBeCloseTo(1000);
  });
});

describe("personAmountToProject", () => {
  it("leaves same-currency amounts unchanged", () => {
    expect(
      personAmountToProject(500, person({ currency: "cad" }), project({ currency: "cad" }), cadOn),
    ).toBe(500);
  });
});
