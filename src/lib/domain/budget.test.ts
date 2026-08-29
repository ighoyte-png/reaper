import { describe, expect, it } from "vitest";
import {
  budgetHealth,
  calendarRangeBars,
  contractorExpenseAggregatesInRange,
  contractorExpenseAppliesInMonth,
  contractorRepeatEndMonth,
  formatHours,
  listedBudgetAmount,
  projectToDateSpan,
  projectHoursSplitInRange,
  scheduleOutsideProjectDates,
  weeklyProgressSeries,
} from "@/lib/domain/budget";
import { convertAmount } from "@/lib/domain/currency";
import {
  DEFAULT_ORG_BUDGET_SETTINGS,
  syncAmountWarningFromMargin,
} from "@/lib/domain/org-settings";
import type {
  Assignment,
  BudgetBurn,
  Project,
  ProjectContractorExpense,
} from "@/lib/types";

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

describe("projectHoursSplitInRange todate future hours", () => {
  it("counts future hours only when rangeEnd extends beyond today", () => {
    const project = makeProject({
      budget_monthly_reset: false,
      start_date: "2026-01-15",
      end_date: "2027-03-31",
    });
    const assignments = [
      makeAssignment({
        start_date: "2026-08-07",
        end_date: "2026-08-07",
        hours_per_day: 8,
      }),
      makeAssignment({
        id: "a2",
        start_date: "2026-09-01",
        end_date: "2026-09-01",
        hours_per_day: 6,
      }),
    ];
    const asOf = new Date("2026-08-17T12:00:00");
    const todayKey = "2026-08-17";

    const toDateSplit = projectHoursSplitInRange(
      project.id,
      assignments,
      [],
      project.start_date!,
      todayKey,
      asOf,
    );
    expect(toDateSplit.usedHours).toBe(8);
    expect(toDateSplit.futureHours).toBe(0);

    const fullSpanSplit = projectHoursSplitInRange(
      project.id,
      assignments,
      [],
      project.start_date!,
      project.end_date!,
      asOf,
    );
    expect(fullSpanSplit.usedHours).toBe(8);
    expect(fullSpanSplit.futureHours).toBe(6);
  });
});

describe("weeklyProgressSeries current week used hours", () => {
  it("exposes weekUsedHours below weekHours when future days remain in the week", () => {
    const asOf = new Date("2026-08-17T12:00:00");
    const points = weeklyProgressSeries(
      makeProject({
        start_date: "2026-08-17",
        end_date: "2026-08-21",
        budget_monthly_reset: false,
      }),
      [
        makeAssignment({
          start_date: "2026-08-17",
          end_date: "2026-08-17",
          hours_per_day: 8,
        }),
        makeAssignment({
          id: "a2",
          start_date: "2026-08-21",
          end_date: "2026-08-21",
          hours_per_day: 6,
        }),
      ],
      asOf,
    );

    const current = points.find((p) => p.isCurrentWeek);
    expect(current).toBeDefined();
    expect(current!.weekHours).toBe(14);
    expect(current!.weekUsedHours).toBe(8);
    expect(current!.weekUsedHours).toBeLessThan(current!.weekHours);
  });
});

describe("weeklyProgressSeries ended project", () => {
  it("counts past assignments as used when the term ended last week", () => {
    const asOf = new Date("2026-08-17T12:00:00");
    const points = weeklyProgressSeries(
      makeProject({
        start_date: "2026-07-13",
        end_date: "2026-08-14",
        budget_monthly_reset: false,
      }),
      [
        makeAssignment({
          start_date: "2026-08-07",
          end_date: "2026-08-07",
          hours_per_day: 6,
        }),
        makeAssignment({
          id: "a2",
          start_date: "2026-08-14",
          end_date: "2026-08-14",
          hours_per_day: 8,
        }),
      ],
      asOf,
    );

    expect(points.length).toBeGreaterThan(0);
    expect(points.every((p) => !p.isCurrentWeek && !p.isFuture)).toBe(true);

    const last = points[points.length - 1]!;
    expect(last.weekStartKey).toBe("2026-08-10");
    expect(last.cumulativeUsed).toBe(14);
    expect(last.cumulativePlanned).toBe(14);
  });
});

describe("listedBudgetAmount", () => {
  it("uses hours × bill rate for monthly hours retainers", () => {
    expect(
      listedBudgetAmount(
        makeProject({
          budget_mode: "hours",
          budget_hours: 15,
          bill_rate: 150,
          budget_monthly_reset: true,
        }),
      ),
    ).toBe(2250);
  });

  it("uses hours × bill rate for non-repeating hours projects", () => {
    expect(
      listedBudgetAmount(
        makeProject({
          budget_mode: "hours",
          budget_hours: 40,
          bill_rate: 175,
          budget_monthly_reset: false,
        }),
      ),
    ).toBe(7000);
  });

  it("returns dollar budget amount in amount mode", () => {
    expect(
      listedBudgetAmount(
        makeProject({
          budget_mode: "amount",
          budget_hours: null,
          budget_amount: 12000,
          bill_rate: null,
        }),
      ),
    ).toBe(12000);
  });

  it("returns 0 when hours are missing or zero", () => {
    expect(
      listedBudgetAmount(
        makeProject({
          budget_mode: "hours",
          budget_hours: 0,
          bill_rate: 150,
        }),
      ),
    ).toBe(0);
    expect(
      listedBudgetAmount(
        makeProject({
          budget_mode: "hours",
          budget_hours: null,
          bill_rate: 150,
        }),
      ),
    ).toBe(0);
  });

  it("falls back to the org default bill rate when the project rate is unset", () => {
    expect(
      listedBudgetAmount(
        makeProject({
          budget_mode: "hours",
          budget_hours: 10,
          bill_rate: null,
        }),
        { ...DEFAULT_ORG_BUDGET_SETTINGS, default_bill_rate: 200 },
      ),
    ).toBe(2000);
  });

  it("converts CAD hours revenue the same as CAD dollar amounts", () => {
    const native = listedBudgetAmount(
      makeProject({
        budget_mode: "hours",
        budget_hours: 15,
        bill_rate: 150,
        currency: "cad",
      }),
    );
    expect(
      convertAmount(native, "cad", "usd", 1.35, true),
    ).toBeCloseTo(2250 / 1.35);
  });
});

function makeExpense(
  partial: Partial<ProjectContractorExpense> = {},
): ProjectContractorExpense {
  return {
    id: "pce-1",
    organization_id: "org",
    project_id: "proj-1",
    person_id: "person-1",
    month_key: "2026-03-01",
    amount: 1000,
    hours: 0,
    notes: "Retainer",
    repeat_monthly: true,
    repeat_end_month: null,
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    created_by_profile_id: null,
    ...partial,
  };
}

describe("contractorRepeatEndMonth", () => {
  it("uses the project end month when the timeline has an end", () => {
    expect(contractorRepeatEndMonth("2026-03-01", "2028-06-15")).toBe(
      "2028-06-01",
    );
  });

  it("falls back to 12 months after start when there is no project end", () => {
    expect(contractorRepeatEndMonth("2026-03-01", null)).toBe("2027-03-01");
    expect(contractorRepeatEndMonth("2026-03-01")).toBe("2027-03-01");
  });

  it("computes an independent end for each start month", () => {
    expect(contractorRepeatEndMonth("2026-01-01", null)).toBe("2027-01-01");
    expect(contractorRepeatEndMonth("2026-06-01", null)).toBe("2027-06-01");
  });
});

describe("contractorExpenseAppliesInMonth", () => {
  const openEnded = makeProject({
    start_date: "2026-01-01",
    end_date: "2028-12-31",
  });

  it("lets an explicit repeat end span past December of the start year", () => {
    const expense = makeExpense({
      month_key: "2026-03-01",
      repeat_end_month: "2028-06-01",
    });
    expect(
      contractorExpenseAppliesInMonth(openEnded, expense, "2026-03"),
    ).toBe(true);
    expect(
      contractorExpenseAppliesInMonth(openEnded, expense, "2027-01"),
    ).toBe(true);
    expect(
      contractorExpenseAppliesInMonth(openEnded, expense, "2028-06"),
    ).toBe(true);
    expect(
      contractorExpenseAppliesInMonth(openEnded, expense, "2028-07"),
    ).toBe(false);
  });

  it("keeps the calendar-year cap when repeat_end_month is null", () => {
    const expense = makeExpense({
      month_key: "2026-03-01",
      repeat_end_month: null,
    });
    expect(
      contractorExpenseAppliesInMonth(openEnded, expense, "2026-12"),
    ).toBe(true);
    expect(
      contractorExpenseAppliesInMonth(openEnded, expense, "2027-01"),
    ).toBe(false);
  });
});

describe("contractorExpenseAggregatesInRange", () => {
  it("keeps the source expense notes on the year/term row", () => {
    const project = makeProject({
      start_date: "2026-01-01",
      end_date: "2026-12-31",
    });
    const rows = contractorExpenseAggregatesInRange(
      project,
      [
        makeExpense({
          repeat_end_month: "2026-12-01",
          notes: "Monthly studio fee",
        }),
      ],
      [],
      "2026-01",
      "2026-12",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.notes).toBe("Monthly studio fee");
    expect(rows[0]!.amount).toBe(1000 * 10);
  });
});

describe("formatHours", () => {
  it("rounds to 2 decimals and drops trailing zeros", () => {
    expect(formatHours(3)).toBe("3h");
    expect(formatHours(3.0)).toBe("3h");
    expect(formatHours(3.5)).toBe("3.5h");
    expect(formatHours(3.5)).toBe("3.5h");
    expect(formatHours(3.7455)).toBe("3.75h");
    expect(formatHours(3.50)).toBe("3.5h");
    expect(formatHours(12.04)).toBe("12.04h");
  });
});
