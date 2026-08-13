import { describe, expect, it } from "vitest";
import {
  buildAppliedTemplate,
  buildExportedTemplate,
  maxSortOrder,
  resolveTemplateAnchorStartDate,
  templateCapabilityFlags,
  templateDateShiftDays,
  uniqueAssigneePersonIds,
} from "@/lib/domain/project-templates";
import type {
  Milestone,
  Project,
  Task,
  TaskList,
  TemplateMilestone,
  TemplateTask,
  TemplateTaskList,
} from "@/lib/types";

const project: Project = {
  id: "proj-1",
  organization_id: "org",
  client_id: null,
  name: "Retainer",
  slug: "retainer",
  status: "active",
  priority: 0,
  color: "#336699",
  start_date: "2026-03-01",
  end_date: "2026-05-31",
  budget_mode: "none",
  budget_hours: null,
  budget_amount: null,
  bill_rate: null,
  budget_monthly_reset: false,
  notes: "",
  manager_person_id: null,
  share_enabled: false,
  share_token: null,
  hide_from_public_share: false,
  sandbox_mode: false,
};

function makeList(partial: Partial<TaskList> & Pick<TaskList, "id">): TaskList {
  return {
    organization_id: "org",
    project_id: "proj-1",
    milestone_id: null,
    name: "March",
    color: null,
    sort_order: 0,
    archived: false,
    hide_from_client: false,
    gantt_enabled: true,
    start_date: "2026-03-01",
    end_date: "2026-03-31",
    ...partial,
  };
}

function makeTask(partial: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return {
    organization_id: "org",
    project_id: "proj-1",
    list_id: "list-1",
    parent_id: null,
    assignee_person_id: "person-1",
    is_divider: false,
    is_client_review: false,
    status: "complete",
    start_date: "2026-03-05",
    due_date: "2026-03-10",
    notes: "<p>hello</p>",
    sort_order: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    created_by_profile_id: null,
    edited_at: null,
    edited_by_profile_id: null,
    status_changed_at: null,
    status_changed_by_profile_id: null,
    ...partial,
  };
}

describe("templateDateShiftDays", () => {
  it("slides from anchor to chosen start", () => {
    expect(templateDateShiftDays("2026-03-01", "2026-04-01")).toBe(31);
  });

  it("is zero without an anchor", () => {
    expect(templateDateShiftDays(null, "2026-04-01")).toBe(0);
  });
});

describe("resolveTemplateAnchorStartDate", () => {
  it("prefers project start", () => {
    expect(
      resolveTemplateAnchorStartDate({
        projectStartDate: "2026-03-01",
        lists: [makeList({ id: "l1", start_date: "2026-02-01" })],
        tasks: [],
        milestones: [],
      }),
    ).toBe("2026-03-01");
  });

  it("falls back to earliest dated entity", () => {
    expect(
      resolveTemplateAnchorStartDate({
        projectStartDate: null,
        lists: [makeList({ id: "l1", start_date: "2026-03-10" })],
        tasks: [makeTask({ id: "t1", title: "A", start_date: "2026-03-02" })],
        milestones: [],
      }),
    ).toBe("2026-03-02");
  });
});

describe("templateCapabilityFlags", () => {
  it("detects descriptions, dates, milestones, assignees", () => {
    const lists: TemplateTaskList[] = [
      {
        id: "tl1",
        organization_id: "org",
        template_id: "tmpl",
        template_milestone_id: null,
        name: "L",
        sort_order: 0,
        gantt_enabled: true,
        start_date: "2026-03-01",
        end_date: "2026-03-31",
      },
    ];
    const tasks: TemplateTask[] = [
      {
        id: "tt1",
        organization_id: "org",
        template_id: "tmpl",
        list_id: "tl1",
        parent_id: null,
        title: "T",
        notes: "<p>x</p>",
        offset_days: null,
        sort_order: 0,
        start_date: null,
        due_date: null,
        assignee_person_id: "p1",
        is_client_review: false,
        is_divider: false,
      },
    ];
    const milestones: TemplateMilestone[] = [
      {
        id: "tm1",
        organization_id: "org",
        template_id: "tmpl",
        name: "M",
        offset_days: 0,
        sort_order: 0,
        start_date: null,
        due_date: null,
      },
    ];
    expect(
      templateCapabilityFlags({
        template: {
          id: "tmpl",
          organization_id: "org",
          name: "T",
          description: "",
          anchor_start_date: "2026-03-01",
        },
        milestones,
        lists,
        tasks,
      }),
    ).toEqual({
      hasDescriptions: true,
      hasDates: true,
      hasMilestones: true,
      hasAssignees: true,
    });
  });
});

describe("buildExportedTemplate / buildAppliedTemplate", () => {
  let seq = 0;
  const idFor = (prefix: string) => `${prefix}-${++seq}`;

  it("strips optional fields when save options are off", () => {
    seq = 0;
    const exported = buildExportedTemplate({
      organizationId: "org",
      templateId: "tmpl",
      name: "Copy",
      project,
      milestones: [
        {
          id: "ms1",
          organization_id: "org",
          project_id: "proj-1",
          name: "Launch",
          start_date: "2026-03-20",
          due_date: "2026-03-20",
          status: "upcoming",
          client_approved: false,
          sort_order: 0,
          approval_enabled: false,
          approval_name: "",
          approval_email: "",
          essential_kind: null,
          essential_label: "",
          essential_url: "",
          approved_by_name: null,
          approved_at: null,
          approved_by_client: false,
        } satisfies Milestone,
      ],
      lists: [makeList({ id: "list-1" })],
      tasks: [
        makeTask({ id: "t1", title: "Design", is_client_review: false }),
        makeTask({
          id: "t2",
          title: "Client Review - Design",
          parent_id: "t1",
          is_client_review: true,
        }),
      ],
      options: {
        includeDescriptions: false,
        includeDates: false,
        includeMilestones: false,
        includeAssignees: false,
      },
      idFor,
    });
    expect(exported.milestones).toHaveLength(0);
    expect(exported.template.anchor_start_date).toBeNull();
    expect(exported.lists[0]?.gantt_enabled).toBe(true);
    expect(exported.lists[0]?.start_date).toBeNull();
    expect(exported.tasks.every((t) => t.notes === "")).toBe(true);
    expect(exported.tasks.every((t) => t.assignee_person_id === null)).toBe(
      true,
    );
    expect(exported.tasks.some((t) => t.is_client_review)).toBe(true);
  });

  it("slides dates and forces gantt off on apply, appending sort order", () => {
    seq = 0;
    const exported = buildExportedTemplate({
      organizationId: "org",
      templateId: "tmpl",
      name: "Copy",
      project,
      milestones: [],
      lists: [makeList({ id: "list-1", sort_order: 0 })],
      tasks: [makeTask({ id: "t1", title: "Design" })],
      options: {
        includeDescriptions: true,
        includeDates: true,
        includeMilestones: false,
        includeAssignees: true,
      },
      idFor,
    });
    expect(exported.template.anchor_start_date).toBe("2026-03-01");

    const applied = buildAppliedTemplate({
      organizationId: "org",
      projectId: "proj-2",
      profileId: "prof-1",
      template: exported.template,
      templateMilestones: exported.milestones,
      templateLists: exported.lists,
      templateTasks: exported.tasks,
      options: {
        includeDescriptions: true,
        includeDates: true,
        includeMilestones: false,
        includeAssignees: true,
        projectStartDate: "2026-04-01",
      },
      listSortBase: maxSortOrder([{ sort_order: 2 }]),
      milestoneSortBase: -1,
      idFor,
    });
    expect(applied.lists[0]?.gantt_enabled).toBe(false);
    expect(applied.lists[0]?.sort_order).toBe(3);
    expect(applied.lists[0]?.start_date).toBe("2026-04-01");
    expect(applied.lists[0]?.end_date).toBe("2026-05-01");
    expect(applied.tasks[0]?.start_date).toBe("2026-04-05");
    expect(applied.tasks[0]?.due_date).toBe("2026-04-10");
    expect(applied.tasks[0]?.status).toBe("upcoming");
    expect(applied.tasks[0]?.assignee_person_id).toBe("person-1");
    expect(applied.projectStartDate).toBe("2026-04-01");
  });
});

describe("uniqueAssigneePersonIds", () => {
  it("returns distinct non-null assignee ids", () => {
    expect(
      uniqueAssigneePersonIds([
        { assignee_person_id: "a" },
        { assignee_person_id: null },
        { assignee_person_id: "b" },
        { assignee_person_id: "a" },
        { assignee_person_id: undefined },
      ]),
    ).toEqual(["a", "b"]);
  });
});
