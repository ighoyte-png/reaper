import { describe, expect, it } from "vitest";
import { projectPeriodEconomics } from "@/lib/domain/forecast";
import type { Assignment, Person, Project } from "@/lib/types";

const project: Project = {
  id: "proj-1",
  organization_id: "org",
  client_id: null,
  name: "Hours retainer",
  slug: "hours-retainer",
  status: "active",
  priority: 0,
  color: "#336699",
  start_date: "2026-01-01",
  end_date: "2026-12-31",
  budget_mode: "hours",
  budget_hours: 20,
  budget_amount: null,
  bill_rate: 200,
  budget_monthly_reset: true,
  notes: "",
  manager_person_id: null,
  share_enabled: false,
  share_token: null,
  hide_from_public_share: false,
  sandbox_mode: false,
};

const person: Person = {
  id: "person-1",
  organization_id: "org",
  profile_id: null,
  name: "Alex",
  email: "alex@example.com",
  role_title: "",
  department: "",
  office: "",
  capacity_hours_week: 40,
  cost_rate: 80,
  timezone: "UTC",
  holiday_calendar_id: null,
  avatar_url: null,
  avatar_attachment_id: null,
  hide_from_schedule: false,
  hide_from_utilization: false,
  is_contractor: false,
  avatar_color: null,
  deleted_at: null,
};

const assignment: Assignment = {
  id: "asg-1",
  organization_id: "org",
  person_id: "person-1",
  project_id: "proj-1",
  start_date: "2026-03-02",
  end_date: "2026-03-06",
  hours_per_day: 5,
  allocation_pct: null,
  status: "confirmed",
  notes: "",
  recurrence: "none",
  recurrence_end_date: null,
  recurrence_exceptions: [],
  created_at: "2026-01-01T00:00:00.000Z",
  edited_at: null,
  edited_by_profile_id: null,
};

describe("projectPeriodEconomics hours retainers", () => {
  it("uses the hour bucket × bill rate even when scheduled hours overrun", () => {
    const economics = projectPeriodEconomics(
      project,
      [assignment],
      [person],
      [],
      [],
      "2026-03-01",
      "2026-03-31",
    );
    expect(economics.scheduleHours).toBe(25);
    expect(economics.revenue).toBe(20 * 200);
    expect(economics.cost).toBe(25 * 80);
  });

  it("scales bucket revenue by months in the range", () => {
    const year = projectPeriodEconomics(
      project,
      [],
      [person],
      [],
      [],
      "2026-01-01",
      "2026-12-31",
    );
    expect(year.revenue).toBe(12 * 20 * 200);

    const term = projectPeriodEconomics(
      { ...project, start_date: "2026-03-01", end_date: "2026-05-31" },
      [],
      [person],
      [],
      [],
      "2026-03-01",
      "2026-05-31",
    );
    expect(term.revenue).toBe(3 * 20 * 200);
  });

  it("keeps non-retainer hours as T&M", () => {
    const economics = projectPeriodEconomics(
      { ...project, budget_monthly_reset: false },
      [assignment],
      [person],
      [],
      [],
      "2026-03-01",
      "2026-03-31",
    );
    expect(economics.revenue).toBe(25 * 200);
  });
});
