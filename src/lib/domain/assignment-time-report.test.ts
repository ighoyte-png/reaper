import { describe, expect, it } from "vitest";
import {
  assignmentTimeStatus,
  buildAssignmentTimeReport,
  formatAssignmentTimeDateRange,
  showAssignmentTimeReport,
} from "@/lib/domain/assignment-time-report";
import type {
  Assignment,
  AssignmentBoundTask,
  Person,
  Project,
  Task,
} from "@/lib/types";

function makeProject(partial: Partial<Project> = {}): Project {
  return {
    id: "proj",
    organization_id: "org",
    client_id: null,
    name: "Retainer",
    slug: "retainer",
    status: "active",
    priority: 3,
    color: "#3B82F6",
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    budget_hours: 40,
    budget_amount: null,
    budget_mode: "hours",
    bill_rate: 150,
    budget_monthly_reset: true,
    assignment_time_reporting: true,
    notes: "",
    manager_person_id: "pm",
    hide_from_public_share: false,
    sandbox_mode: false,
    ...partial,
  };
}

function makePerson(id: string, name: string): Person {
  return {
    id,
    organization_id: "org",
    profile_id: null,
    name,
    email: "",
    role_title: "",
    department: "",
    office: "",
    capacity_hours_week: 40,
    cost_rate: 100,
    timezone: "",
    holiday_calendar_id: null,
    avatar_url: null,
    avatar_attachment_id: null,
    hide_from_schedule: false,
    hide_from_utilization: false,
    is_contractor: false,
    avatar_color: null,
    deleted_at: null,
  };
}

function makeAssignment(
  partial: Partial<Assignment> &
    Pick<Assignment, "id" | "person_id" | "start_date" | "end_date">,
): Assignment {
  return {
    organization_id: "org",
    project_id: "proj",
    hours_per_day: 4,
    allocation_pct: null,
    status: "confirmed",
    notes: "",
    recurrence: "none",
    recurrence_end_date: null,
    recurrence_exceptions: [],
    created_at: "",
    edited_at: null,
    edited_by_profile_id: null,
    ...partial,
  };
}

describe("assignment time report", () => {
  it("gates on hours monthly + flag", () => {
    expect(showAssignmentTimeReport(makeProject())).toBe(true);
    expect(
      showAssignmentTimeReport(
        makeProject({ assignment_time_reporting: false }),
      ),
    ).toBe(false);
    expect(
      showAssignmentTimeReport(makeProject({ budget_monthly_reset: false })),
    ).toBe(false);
  });

  it("marks planned vs completed by slice end vs today", () => {
    expect(assignmentTimeStatus("2026-03-01", "2026-03-15")).toBe("completed");
    expect(assignmentTimeStatus("2026-03-15", "2026-03-15")).toBe("planned");
    expect(assignmentTimeStatus("2026-03-20", "2026-03-15")).toBe("planned");
  });

  it("formats date ranges without trailing zeros", () => {
    expect(formatAssignmentTimeDateRange("2026-03-02", "2026-03-02")).toMatch(
      /Mar 2, 2026/,
    );
    expect(formatAssignmentTimeDateRange("2026-03-02", "2026-03-04")).toMatch(
      /–/,
    );
  });

  it("lists bound tasks, production time, and amalgamates unbound PM hours", () => {
    const project = makeProject();
    const people = [makePerson("pm", "Pat Manager"), makePerson("dev", "Dev")];
    const assignments = [
      makeAssignment({
        id: "a-pm",
        person_id: "pm",
        start_date: "2026-03-02",
        end_date: "2026-03-02",
        hours_per_day: 2,
      }),
      makeAssignment({
        id: "a-dev",
        person_id: "dev",
        start_date: "2026-03-03",
        end_date: "2026-03-04",
        hours_per_day: 4,
      }),
      makeAssignment({
        id: "a-dev-prod",
        person_id: "dev",
        start_date: "2026-03-05",
        end_date: "2026-03-05",
        hours_per_day: 3,
      }),
    ];
    const tasks: Task[] = [
      {
        id: "t1",
        organization_id: "org",
        project_id: "proj",
        list_id: "l1",
        parent_id: null,
        assignee_person_id: "dev",
        title: "Homepage",
        is_divider: false,
        is_client_review: false,
        status: "upcoming",
        start_date: null,
        due_date: null,
        notes: "",
        sort_order: 0,
        created_at: "",
        created_by_profile_id: null,
        edited_at: null,
        edited_by_profile_id: null,
        status_changed_at: null,
        status_changed_by_profile_id: null,
        assignee_notified_at: null,
      },
    ];
    const boundTasks: AssignmentBoundTask[] = [
      {
        assignment_id: "a-dev",
        task_id: "t1",
        organization_id: "org",
        sort_order: 0,
        bound_source: "schedule",
        out_of_sync: false,
      },
    ];

    const sections = buildAssignmentTimeReport({
      project,
      assignments,
      boundTasks,
      tasks,
      people,
      contractorExpenses: [],
      todayKey: "2026-03-10",
      months: [{ year: 2026, monthIndex: 2 }],
    });

    expect(sections).toHaveLength(1);
    const section = sections[0]!;
    const body = section.rows.filter(
      (r) => r.kind === "assignment" || r.kind === "contractor",
    );
    expect(body).toHaveLength(2);
    expect(body[0]!.taskLabels).toEqual(["Homepage"]);
    expect(body[1]!.taskLabels).toEqual(["Production Time"]);
    expect(section.pmHours).toBe(2);
    expect(section.rows.some((r) => r.kind === "project_management")).toBe(
      true,
    );
    expect(section.totalHours).toBe(2 + 8 + 3);
  });
});
