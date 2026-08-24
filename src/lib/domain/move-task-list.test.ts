import { describe, expect, it } from "vitest";
import { applyMoveTaskList } from "@/lib/domain/move-task-list";
import type { Task, TaskList } from "@/lib/types";

function makeList(partial: Partial<TaskList> & Pick<TaskList, "id">): TaskList {
  return {
    organization_id: "org",
    project_id: "src",
    milestone_id: null,
    name: "List",
    color: "#336699",
    sort_order: 2,
    archived: false,
    hide_from_client: false,
    gantt_enabled: true,
    start_date: "2026-03-01",
    end_date: "2026-03-31",
    ...partial,
  };
}

function makeTask(
  partial: Partial<Task> & Pick<Task, "id" | "list_id">,
): Task {
  return {
    organization_id: "org",
    project_id: "src",
    parent_id: null,
    assignee_person_id: "person-1",
    title: "Task",
    is_divider: false,
    is_client_review: false,
    status: "active",
    start_date: "2026-03-05",
    due_date: "2026-03-10",
    notes: "<p>desc</p>",
    sort_order: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    created_by_profile_id: "prof",
    edited_at: "2026-01-02T00:00:00.000Z",
    edited_by_profile_id: "prof",
    status_changed_at: "2026-01-02T00:00:00.000Z",
    status_changed_by_profile_id: "prof",
    assignee_notified_at: null,
    ...partial,
  };
}

describe("applyMoveTaskList", () => {
  it("returns null when the list is missing or already on the target", () => {
    const lists = [makeList({ id: "l1" })];
    expect(
      applyMoveTaskList({
        lists,
        tasks: [],
        listId: "missing",
        targetProjectId: "dst",
      }),
    ).toBeNull();
    expect(
      applyMoveTaskList({
        lists,
        tasks: [],
        listId: "l1",
        targetProjectId: "src",
      }),
    ).toBeNull();
  });

  it("moves the list to sort 0, clears the milestone, and bumps target lists", () => {
    const lists = [
      makeList({ id: "moving", milestone_id: "ms-1", sort_order: 4 }),
      makeList({
        id: "dst-active",
        project_id: "dst",
        sort_order: 0,
      }),
      makeList({
        id: "dst-archived",
        project_id: "dst",
        archived: true,
        sort_order: 0,
      }),
    ];
    const tasks = [
      makeTask({ id: "parent", list_id: "moving", sort_order: 1 }),
      makeTask({
        id: "child",
        list_id: "moving",
        parent_id: "parent",
        sort_order: 0,
      }),
      makeTask({ id: "other", list_id: "other", project_id: "src" }),
    ];

    const next = applyMoveTaskList({
      lists,
      tasks,
      listId: "moving",
      targetProjectId: "dst",
    });
    expect(next).not.toBeNull();
    const moved = next!.lists.find((l) => l.id === "moving")!;
    expect(moved.project_id).toBe("dst");
    expect(moved.milestone_id).toBeNull();
    expect(moved.sort_order).toBe(0);
    expect(moved.gantt_enabled).toBe(true);
    expect(moved.color).toBe("#336699");
    expect(next!.lists.find((l) => l.id === "dst-active")?.sort_order).toBe(1);
    expect(next!.lists.find((l) => l.id === "dst-archived")?.sort_order).toBe(0);

    const parent = next!.tasks.find((t) => t.id === "parent")!;
    const child = next!.tasks.find((t) => t.id === "child")!;
    expect(parent.project_id).toBe("dst");
    expect(parent.list_id).toBe("moving");
    expect(parent.sort_order).toBe(1);
    expect(parent.status).toBe("active");
    expect(parent.notes).toBe("<p>desc</p>");
    expect(child.project_id).toBe("dst");
    expect(child.parent_id).toBe("parent");
    expect(next!.tasks.find((t) => t.id === "other")?.project_id).toBe("src");
  });
});
