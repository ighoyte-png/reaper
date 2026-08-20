import { describe, expect, it } from "vitest";
import { monthlyYearBarsFromRpcRows } from "@/lib/data/rpc-map";
import type { MonthlyRetainerYearBarRow } from "@/lib/supabase/api";
import type { Project } from "@/lib/types";

function monthlyProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj-1",
    organization_id: "org-1",
    client_id: null,
    name: "Retainer",
    slug: "retainer",
    status: "active",
    priority: 0,
    color: "#000",
    start_date: null,
    end_date: null,
    budget_hours: 40,
    budget_amount: null,
    budget_mode: "hours",
    bill_rate: 100,
    budget_monthly_reset: true,
    notes: "",
    manager_person_id: null,
    hide_from_public_share: false,
    sandbox_mode: false,
    ...overrides,
  };
}

describe("monthlyYearBarsFromRpcRows", () => {
  it("treats RPC used_* as totals and maps internal-only for MonthBurnBar", () => {
    const year = 2026;
    const rows: MonthlyRetainerYearBarRow[] = [
      {
        project_id: "proj-1",
        month_index: 0,
        // Contractor-only: totals equal contractor columns (current RPC shape).
        used_hours: 10,
        future_hours: 5,
        used_amount: 0,
        future_amount: 0,
        contractor_used_hours: 10,
        contractor_future_hours: 5,
        contractor_used_amount: 0,
        contractor_future_amount: 0,
      },
    ];

    const bars = monthlyYearBarsFromRpcRows(monthlyProject(), year, rows);
    const jan = bars[0];
    expect(jan.usedHours).toBe(0);
    expect(jan.futureHours).toBe(0);
    expect(jan.contractorUsedHours).toBe(10);
    expect(jan.contractorFutureHours).toBe(5);
    expect(jan.contractorHours).toBe(15);
    expect(jan.plannedHours).toBe(15);
    expect(jan.value).toBe(15);
  });

  it("keeps internal hours after subtracting contractor from totals", () => {
    const year = 2026;
    const rows: MonthlyRetainerYearBarRow[] = [
      {
        project_id: "proj-1",
        month_index: 2,
        used_hours: 30,
        future_hours: 20,
        used_amount: 0,
        future_amount: 0,
        contractor_used_hours: 10,
        contractor_future_hours: 5,
        contractor_used_amount: 0,
        contractor_future_amount: 0,
      },
    ];

    const mar = monthlyYearBarsFromRpcRows(monthlyProject(), year, rows)[2];
    expect(mar.usedHours).toBe(20);
    expect(mar.futureHours).toBe(15);
    expect(mar.contractorHours).toBe(15);
    expect(mar.plannedHours).toBe(50);
  });
});
