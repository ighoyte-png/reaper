import { describe, expect, it } from "vitest";
import {
  isTrueLocalEcho,
  taskListRealtimeEqual,
  taskRealtimeEqual,
} from "@/lib/data/realtime-patch";
import type { DemoState, Task, TaskList } from "@/lib/types";

function makeTask(partial: Partial<Task> & Pick<Task, "id">): Task {
  return {
    organization_id: "org",
    project_id: "proj",
    list_id: "list",
    parent_id: null,
    assignee_person_id: null,
    title: "Task",
    is_divider: false,
    is_client_review: false,
    status: "upcoming",
    start_date: null,
    due_date: null,
    notes: "",
    sort_order: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    created_by_profile_id: null,
    edited_at: null,
    edited_by_profile_id: null,
    status_changed_at: null,
    status_changed_by_profile_id: null,
    assignee_notified_at: null,
    ...partial,
  };
}

function makeList(partial: Partial<TaskList> & Pick<TaskList, "id">): TaskList {
  return {
    organization_id: "org",
    project_id: "proj",
    milestone_id: null,
    name: "List",
    color: null,
    sort_order: 0,
    archived: false,
    hide_from_client: false,
    gantt_enabled: false,
    start_date: null,
    end_date: null,
    ...partial,
  };
}

function bareState(tasks: Task[], task_lists: TaskList[] = []): DemoState {
  return {
    tasks,
    task_lists,
  } as DemoState;
}

describe("taskRealtimeEqual", () => {
  it("treats matching board fields as equal", () => {
    const a = makeTask({ id: "t1", notes: "hello", sort_order: 2 });
    const b = makeTask({ id: "t1", notes: "hello", sort_order: 2 });
    expect(taskRealtimeEqual(a, b)).toBe(true);
  });

  it("detects list move and notes changes", () => {
    const a = makeTask({ id: "t1", list_id: "a", notes: "one" });
    expect(
      taskRealtimeEqual(a, makeTask({ id: "t1", list_id: "b", notes: "one" })),
    ).toBe(false);
    expect(
      taskRealtimeEqual(a, makeTask({ id: "t1", list_id: "a", notes: "two" })),
    ).toBe(false);
  });
});

describe("taskListRealtimeEqual", () => {
  it("detects sort_order changes", () => {
    const a = makeList({ id: "l1", sort_order: 1 });
    expect(taskListRealtimeEqual(a, makeList({ id: "l1", sort_order: 1 }))).toBe(
      true,
    );
    expect(taskListRealtimeEqual(a, makeList({ id: "l1", sort_order: 2 }))).toBe(
      false,
    );
  });
});

describe("isTrueLocalEcho", () => {
  it("skips identical task upsert echoes", () => {
    const task = makeTask({
      id: "t1",
      notes: "x",
      edited_at: "2026-08-12T00:00:00Z",
    });
    const state = bareState([task]);
    expect(
      isTrueLocalEcho(
        state,
        "tasks",
        "UPDATE",
        {
          id: task.id,
          organization_id: task.organization_id,
          project_id: task.project_id,
          list_id: task.list_id,
          parent_id: task.parent_id,
          assignee_person_id: task.assignee_person_id,
          title: task.title,
          is_divider: task.is_divider,
          is_client_review: task.is_client_review,
          status: task.status,
          start_date: task.start_date,
          due_date: task.due_date,
          notes: task.notes,
          sort_order: task.sort_order,
          created_at: task.created_at,
          created_by_profile_id: task.created_by_profile_id,
          edited_at: task.edited_at,
          edited_by_profile_id: task.edited_by_profile_id,
          status_changed_at: task.status_changed_at,
          status_changed_by_profile_id: task.status_changed_by_profile_id,
        },
        null,
      ),
    ).toBe(true);
  });

  it("applies concurrent remote task move during echo window", () => {
    const local = makeTask({ id: "t1", list_id: "list-a", sort_order: 0 });
    const state = bareState([local]);
    expect(
      isTrueLocalEcho(
        state,
        "tasks",
        "UPDATE",
        {
          id: "t1",
          organization_id: "org",
          project_id: "proj",
          list_id: "list-b",
          parent_id: null,
          assignee_person_id: null,
          title: "Task",
          is_divider: false,
          is_client_review: false,
          status: "upcoming",
          start_date: null,
          due_date: null,
          notes: "",
          sort_order: 3,
          created_at: local.created_at,
          created_by_profile_id: null,
          edited_at: "2026-08-12T12:00:00Z",
          edited_by_profile_id: "other",
          status_changed_at: null,
          status_changed_by_profile_id: null,
          assignee_notified_at: null,
        },
        null,
      ),
    ).toBe(false);
  });

  it("applies remote delete when row still present", () => {
    const task = makeTask({ id: "t1" });
    const state = bareState([task]);
    expect(
      isTrueLocalEcho(state, "tasks", "DELETE", null, { id: "t1" }),
    ).toBe(false);
  });

  it("skips delete echo when row already removed", () => {
    const state = bareState([]);
    expect(
      isTrueLocalEcho(state, "tasks", "DELETE", null, { id: "t1" }),
    ).toBe(true);
  });
});
