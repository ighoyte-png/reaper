import { describe, expect, it } from "vitest";
import {
  alignAfterSourceShiftDays,
  buildCopiedTaskList,
  canOfferAlignAfterSource,
  shiftDateKey,
} from "@/lib/domain/copy-task-list";
import type { Task, TaskList } from "@/lib/types";

function makeList(partial: Partial<TaskList> & Pick<TaskList, "id">): TaskList {
  return {
    organization_id: "org",
    project_id: "proj",
    milestone_id: null,
    name: "March Retainer",
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
  partial: Partial<Task> & Pick<Task, "id" | "title">,
): Task {
  return {
    organization_id: "org",
    project_id: "proj",
    list_id: "list-1",
    parent_id: null,
    assignee_person_id: "person-1",
    is_divider: false,
    is_client_review: false,
    status: "active",
    start_date: null,
    due_date: null,
    notes: "<p>desc</p>",
    sort_order: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    created_by_profile_id: "prof",
    edited_at: "2026-01-02T00:00:00.000Z",
    edited_by_profile_id: "prof",
    status_changed_at: "2026-01-02T00:00:00.000Z",
    status_changed_by_profile_id: "prof",
    ...partial,
  };
}

describe("shiftDateKey", () => {
  it("returns null for empty dates", () => {
    expect(shiftDateKey(null, 5)).toBeNull();
    expect(shiftDateKey(undefined, 5)).toBeNull();
  });

  it("shifts by calendar days", () => {
    expect(shiftDateKey("2026-03-01", 31)).toBe("2026-04-01");
  });
});

describe("canOfferAlignAfterSource", () => {
  it("requires gantt, list dates, and a task date", () => {
    const list = makeList({ id: "list-1" });
    expect(
      canOfferAlignAfterSource(list, [
        makeTask({ id: "t1", title: "A", start_date: "2026-03-05" }),
      ]),
    ).toBe(true);
    expect(
      canOfferAlignAfterSource(
        { ...list, gantt_enabled: false },
        [makeTask({ id: "t1", title: "A", start_date: "2026-03-05" })],
      ),
    ).toBe(false);
    expect(
      canOfferAlignAfterSource(list, [makeTask({ id: "t1", title: "A" })]),
    ).toBe(false);
  });
});

describe("alignAfterSourceShiftDays", () => {
  it("starts the day after the list ends", () => {
    // Mar 1 → Apr 1 is 31 calendar days
    expect(
      alignAfterSourceShiftDays({
        start_date: "2026-03-01",
        end_date: "2026-03-31",
      }),
    ).toBe(31);
  });
});

describe("buildCopiedTaskList", () => {
  const sourceList = makeList({ id: "list-1" });
  const root = makeTask({
    id: "root",
    title: "Design",
    start_date: "2026-03-02",
    due_date: "2026-03-10",
    status: "complete",
    sort_order: 0,
  });
  const cr = makeTask({
    id: "cr",
    title: "Client Review - Design",
    parent_id: "root",
    is_client_review: true,
    status: "complete",
    due_date: "2026-03-12",
    sort_order: 0,
  });
  let seq = 0;

  function idForTask() {
    seq += 1;
    return `new-${seq}`;
  }

  it("keeps absolute dates when not aligning", () => {
    seq = 0;
    const { list, tasks } = buildCopiedTaskList({
      sourceList,
      sourceTasks: [root, cr],
      newListId: "list-copy",
      idForTask,
      organizationId: "org",
      alignAfterSource: false,
    });
    expect(list.name).toBe("Copy of - March Retainer");
    expect(list.gantt_enabled).toBe(false);
    expect(list.start_date).toBe("2026-03-01");
    expect(list.end_date).toBe("2026-03-31");
    expect(list.sort_order).toBe(3);
    expect(list.color).toBe("#336699");

    const copiedRoot = tasks.find((t) => t.title === "Design")!;
    const copiedCr = tasks.find((t) => t.is_client_review)!;
    expect(copiedRoot.status).toBe("upcoming");
    expect(copiedRoot.assignee_person_id).toBe("person-1");
    expect(copiedRoot.notes).toBe("<p>desc</p>");
    expect(copiedRoot.start_date).toBe("2026-03-02");
    expect(copiedRoot.due_date).toBe("2026-03-10");
    expect(copiedCr.parent_id).toBe(copiedRoot.id);
    expect(copiedCr.title).toBe("Client Review - Design");
    // parents first
    expect(tasks[0]?.id).toBe(copiedRoot.id);
  });

  it("slides dates after the source list end when aligning", () => {
    seq = 0;
    const { list, tasks } = buildCopiedTaskList({
      sourceList,
      sourceTasks: [root, cr],
      newListId: "list-copy",
      idForTask,
      organizationId: "org",
      alignAfterSource: true,
    });
    expect(list.start_date).toBe("2026-04-01");
    expect(list.end_date).toBe("2026-05-01");
    const copiedRoot = tasks.find((t) => t.title === "Design")!;
    expect(copiedRoot.start_date).toBe("2026-04-02");
    expect(copiedRoot.due_date).toBe("2026-04-10");
    const copiedCr = tasks.find((t) => t.is_client_review)!;
    expect(copiedCr.due_date).toBe("2026-04-12");
  });
});
