import { describe, expect, it } from "vitest";
import {
  budgetHealth,
  calendarRangeBars,
  projectToDateSpan,
  scheduleOutsideProjectDates,
} from "@/lib/domain/budget";
import {
  DEFAULT_ORG_BUDGET_SETTINGS,
  syncAmountWarningFromMargin,
} from "@/lib/domain/org-settings";
import type { Assignment, BudgetBurn, Project } from "@/lib/types";

const warning75 = {
  ...DEFAULT_ORG_BUDGET_SETTINGS,
  amount_warning_pct: 75,
  amount_over_pct: 100,
};

function amountBurn(pct: number, fee = 7500): BudgetBurn {
  const planned = (pct / 100) * fee;
  return {
    totalHours: 0,
    plannedHours: 0,
    usedHours: 0,
    futureHours: 0,
    remainingHours: 0,
    pct,
    overBy: 0,
    totalAmount: fee,
    plannedAmount: planned,
    usedAmount: planned,
    futureAmount: 0,
    remainingAmount: fee - planned,
    amountOverBy: Math.max(0, planned - fee),
    mode: "amount",
    contractorHours: 0,
    contractorAmount: 0,
    contractorUsedHours: 0,
    contractorFutureHours: 0,
    contractorUsedAmount: 0,
    contractorFutureAmount: 0,
  };
}

function makeProject(partial: Partial<Project> = {}): Project {
  return {
    id: "proj-1",
    organization_id: "org",
    client_id: null,
    name: "Budget",
    slug: "budget",
    status: "active",
    priority: 0,
    color: "#336699",
    start_date: "2026-01-15",
    end_date: "2027-03-31",
    budget_mode: "hours",
    budget_hours: 40,
    budget_amount: null,
    bill_rate: null,
    budget_monthly_reset: true,
    notes: "",
    manager_person_id: null,
    share_enabled: false,
    share_token: null,
    hide_from_public_share: false,
    sandbox_mode: false,
    ...partial,
  };
}

function makeAssignment(partial: Partial<Assignment> = {}): Assignment {
  return {
    id: "a1",
    organization_id: "org",
    person_id: "p1",
    project_id: "proj-1",
    start_date: "2026-01-15",
    end_date: "2026-01-15",
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
    ...partial,
  };
}

describe("budgetHealth amount warning", () => {
  it("treats 75% of fee as near when warning is 75", () => {
    expect(budgetHealth(amountBurn(75), warning75)).toBe("near");
  });

  it("treats 74.99% of fee as healthy when warning is 75", () => {
    expect(budgetHealth(amountBurn(74.99), warning75)).toBe("healthy");
  });
});

describe("syncAmountWarningFromMargin", () => {
  it("stores target cost % with no +1 gap", () => {
    expect(syncAmountWarningFromMargin(25)).toBe(75);
  });
});

describe("calendarRangeBars", () => {
  it("spans inclusive months from term start through end across years", () => {
    const bars = calendarRangeBars(
      makeProject(),
      [],
      [],
      "2026-01-15",
      "2027-03-31",
    );
    expect(bars).toHaveLength(15);
    expect(bars[0]?.key).toBe("2026-01");
    expect(bars[bars.length - 1]?.key).toBe("2027-03");
  });
});

describe("scheduleOutsideProjectDates", () => {
  it("is false when neither date is set", () => {
    expect(
      scheduleOutsideProjectDates(
        makeProject({ start_date: null, end_date: null }),
        [makeAssignment({ start_date: "2025-12-01", end_date: "2025-12-01" })],
      ),
    ).toBe(false);
  });

  it("is true when confirmed hours fall before start", () => {
    expect(
      scheduleOutsideProjectDates(makeProject(), [
        makeAssignment({
          start_date: "2026-01-14",
          end_date: "2026-01-14",
        }),
      ]),
    ).toBe(true);
  });

  it("is false when hours sit on the start date", () => {
    expect(
      scheduleOutsideProjectDates(makeProject(), [
        makeAssignment({
          start_date: "2026-01-15",
          end_date: "2026-01-15",
        }),
      ]),
    ).toBe(false);
  });
});

describe("projectToDateSpan", () => {
  it("uses start_date through today", () => {
    expect(
      projectToDateSpan(makeProject(), [], new Date("2026-08-17T12:00:00")),
    ).toEqual({ startKey: "2026-01-15", endKey: "2026-08-17" });
  });

  it("falls back to earliest confirmed assignment when undated", () => {
    expect(
      projectToDateSpan(
        makeProject({ start_date: null, end_date: null }),
        [
          makeAssignment({
            start_date: "2026-03-02",
            end_date: "2026-03-02",
          }),
          makeAssignment({
            id: "a2",
            start_date: "2026-04-01",
            end_date: "2026-04-01",
          }),
        ],
        new Date("2026-08-17T12:00:00"),
      ),
    ).toEqual({ startKey: "2026-03-02", endKey: "2026-08-17" });
  });
});
