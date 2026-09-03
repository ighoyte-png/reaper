import { describe, expect, it } from "vitest";
import { productionHoursEstimate } from "@/lib/domain/production-hours";
import { DEFAULT_ORG_BUDGET_SETTINGS } from "@/lib/domain/org-settings";
import type {
  Assignment,
  Person,
  Project,
  ProjectMember,
} from "@/lib/types";

const settings = {
  ...DEFAULT_ORG_BUDGET_SETTINGS,
  target_profit_margin_pct: 25,
  amount_warning_pct: 76,
  amount_over_pct: 100,
};

function makeProject(partial: Partial<Project> = {}): Project {
  return {
    id: "proj-1",
    organization_id: "org",
    client_id: null,
    name: "Fixed Fee",
    slug: "fixed-fee",
    status: "active",
    priority: 0,
    color: "#336699",
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    budget_mode: "amount",
    budget_hours: null,
    budget_amount: 15000,
    bill_rate: null,
    budget_monthly_reset: false,
    assignment_time_reporting: false,
    notes: "",
    manager_person_id: null,
    share_enabled: false,
    share_token: null,
    hide_from_public_share: false,
    sandbox_mode: false,
    ...partial,
  };
}

function makePerson(partial: Partial<Person> & Pick<Person, "id">): Person {
  return {
    organization_id: "org",
    profile_id: null,
    name: partial.id,
    email: "",
    role_title: "",
    department: "",
    office: "",
    capacity_hours_week: 40,
    cost_rate: 75,
    timezone: "UTC",
    holiday_calendar_id: null,
    avatar_url: null,
    avatar_attachment_id: null,
    hide_from_schedule: false,
    hide_from_utilization: false,
    is_contractor: false,
    avatar_color: null,
    deleted_at: null,
    ...partial,
  };
}

function makeMember(
  personId: string,
  partial: Partial<ProjectMember> = {},
): ProjectMember {
  return {
    project_id: "proj-1",
    person_id: personId,
    organization_id: "org",
    contractor_mode: null,
    contractor_fixed_fee: null,
    contractor_hours: null,
    ...partial,
  };
}

describe("productionHoursEstimate", () => {
  it("returns null for non-amount budgets", () => {
    expect(
      productionHoursEstimate(
        makeProject({ budget_mode: "hours", budget_hours: 80, budget_amount: null }),
        [],
        [makePerson({ id: "p1" })],
        [makeMember("p1")],
        [],
        settings,
      ),
    ).toBeNull();
  });

  it("flags empty team without computing rates", () => {
    const est = productionHoursEstimate(
      makeProject(),
      [],
      [],
      [],
      [],
      settings,
    );
    expect(est?.emptyTeam).toBe(true);
    expect(est?.avgCostRate).toBe(0);
    expect(est?.breakEvenHours).toBe(0);
  });

  it("uses fee ÷ avg cost and target margin", () => {
    const people = [
      makePerson({ id: "p1", cost_rate: 50 }),
      makePerson({ id: "p2", cost_rate: 100 }),
    ];
    const est = productionHoursEstimate(
      makeProject(),
      [],
      people,
      [makeMember("p1"), makeMember("p2")],
      [],
      settings,
    );
    expect(est?.emptyTeam).toBe(false);
    expect(est?.avgCostRate).toBe(75);
    expect(est?.breakEvenHours).toBe(200);
    expect(est?.targetMarginHours).toBe(150);
    expect(est?.remainingTargetHours).toBe(150);
    expect(est?.remainingBreakEvenHours).toBe(200);
  });

  it("reduces the fee pool by contractor fixed fee", () => {
    const staff = makePerson({ id: "p1", cost_rate: 75 });
    const contractor = makePerson({
      id: "c1",
      cost_rate: 100,
      is_contractor: true,
      hide_from_schedule: true,
      hide_from_utilization: true,
    });
    const est = productionHoursEstimate(
      makeProject({ budget_amount: 15000 }),
      [],
      [staff, contractor],
      [
        makeMember("p1"),
        makeMember("c1", {
          contractor_mode: "fixed_fee",
          contractor_fixed_fee: 3000,
        }),
      ],
      [],
      settings,
    );
    // Pool 12000 / 75 = 160 break-even; 75% = 120 target
    expect(est?.contractorAmount).toBe(3000);
    expect(est?.breakEvenHours).toBe(160);
    expect(est?.targetMarginHours).toBe(120);
    expect(est?.avgCostRate).toBe(75);
  });

  it("counts scheduled used/future against remaining", () => {
    const person = makePerson({ id: "p1", cost_rate: 75 });
    const asOf = new Date("2026-03-10T12:00:00");
    const assignments: Assignment[] = [
      {
        id: "a1",
        organization_id: "org",
        person_id: "p1",
        project_id: "proj-1",
        start_date: "2026-03-02",
        end_date: "2026-03-06",
        hours_per_day: 8,
        allocation_pct: null,
        status: "confirmed",
        notes: "",
        recurrence: "none",
        recurrence_end_date: null,
        recurrence_exceptions: [],
        created_at: "2026-01-01T00:00:00.000Z",
        edited_at: null,
        edited_by_profile_id: null,
      },
      {
        id: "a2",
        organization_id: "org",
        person_id: "p1",
        project_id: "proj-1",
        start_date: "2026-03-16",
        end_date: "2026-03-20",
        hours_per_day: 4,
        allocation_pct: null,
        status: "confirmed",
        notes: "",
        recurrence: "none",
        recurrence_end_date: null,
        recurrence_exceptions: [],
        created_at: "2026-01-01T00:00:00.000Z",
        edited_at: null,
        edited_by_profile_id: null,
      },
    ];
    const est = productionHoursEstimate(
      makeProject(),
      assignments,
      [person],
      [makeMember("p1")],
      [],
      settings,
      asOf,
    );
    // Mar 2–6 = 5 weekdays × 8 = 40 used; Mar 16–20 = 5 × 4 = 20 future
    expect(est?.usedHours).toBe(40);
    expect(est?.futureHours).toBe(20);
    expect(est?.remainingTargetHours).toBe(150 - 60);
    expect(est?.remainingBreakEvenHours).toBe(200 - 60);
  });

  it("uses the monthly fee window for amount retainers", () => {
    const person = makePerson({ id: "p1", cost_rate: 100 });
    const est = productionHoursEstimate(
      makeProject({
        budget_amount: 5000,
        budget_monthly_reset: true,
      }),
      [],
      [person],
      [makeMember("p1")],
      [],
      settings,
      new Date("2026-06-15T12:00:00"),
    );
    expect(est?.fee).toBe(5000);
    expect(est?.breakEvenHours).toBe(50);
    expect(est?.targetMarginHours).toBe(37.5);
  });
});
