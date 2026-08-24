import { describe, expect, it } from "vitest";
import {
  collectPersonOverdueTasks,
  isTaskInReview,
  taskOnPersonOverdueList,
} from "@/lib/domain/tasks";
import type { Person, Project, Task } from "@/lib/types";

type PersonLite = Pick<Person, "id" | "profile_id">;
type ProjectLite = Pick<Project, "manager_person_id">;

function task(
  partial: Partial<Task> & Pick<Task, "id" | "status">,
): Task {
  return {
    organization_id: "org",
    project_id: "proj",
    list_id: "list",
    parent_id: null,
    title: "Task",
    notes: "",
    assignee_person_id: null,
    due_date: null,
    start_date: null,
    sort_order: 0,
    is_divider: false,
    is_client_review: false,
    created_at: "2026-01-01T00:00:00Z",
    created_by_profile_id: null,
    edited_at: null,
    edited_by_profile_id: null,
    status_changed_at: null,
    status_changed_by_profile_id: null,
    assignee_notified_at: null,
    ...partial,
  };
}

const assignee: PersonLite = { id: "assignee", profile_id: "prof-assignee" };
const assigner: PersonLite = { id: "assigner", profile_id: "prof-assigner" };
const project: ProjectLite = { manager_person_id: assigner.id };
const people = [assignee, assigner];
const projectById = new Map([["proj", project]]);

describe("In Review overdue ownership", () => {
  it("treats status active as In Review", () => {
    expect(isTaskInReview(task({ id: "1", status: "active" }))).toBe(true);
    expect(isTaskInReview(task({ id: "2", status: "upcoming" }))).toBe(false);
  });

  it("keeps Active overdue on the assignee", () => {
    const t = task({
      id: "1",
      status: "upcoming",
      assignee_person_id: assignee.id,
      due_date: "2026-01-01",
      created_by_profile_id: assigner.profile_id,
    });
    expect(taskOnPersonOverdueList(t, assignee.id, people, project)).toBe(true);
    expect(taskOnPersonOverdueList(t, assigner.id, people, project)).toBe(
      false,
    );
  });

  it("moves In Review overdue to the assigner", () => {
    const t = task({
      id: "1",
      status: "active",
      assignee_person_id: assignee.id,
      due_date: "2026-01-01",
      created_by_profile_id: assigner.profile_id,
    });
    expect(taskOnPersonOverdueList(t, assignee.id, people, project)).toBe(
      false,
    );
    expect(taskOnPersonOverdueList(t, assigner.id, people, project)).toBe(true);
  });

  it("includes all past-due open tasks when personId is null", () => {
    const tasks = [
      task({
        id: "1",
        status: "active",
        assignee_person_id: assignee.id,
        due_date: "2026-01-01",
        created_by_profile_id: assigner.profile_id,
      }),
      task({
        id: "2",
        status: "upcoming",
        assignee_person_id: assignee.id,
        due_date: "2026-01-01",
      }),
    ];
    const overdue = collectPersonOverdueTasks(
      tasks,
      null,
      people,
      projectById,
      "2026-01-10",
    );
    expect(overdue.map((t) => t.id).sort()).toEqual(["1", "2"]);
  });

  it("collects assigner In Review overdue even when they are not the assignee", () => {
    const tasks = [
      task({
        id: "1",
        status: "active",
        assignee_person_id: assignee.id,
        due_date: "2026-01-01",
        created_by_profile_id: assigner.profile_id,
      }),
    ];
    const overdue = collectPersonOverdueTasks(
      tasks,
      assigner.id,
      people,
      projectById,
      "2026-01-10",
    );
    expect(overdue.map((t) => t.id)).toEqual(["1"]);
  });
});
