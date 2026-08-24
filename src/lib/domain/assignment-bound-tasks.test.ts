import { describe, expect, it } from "vitest";
import {
  assignmentIsOutOfSync,
  assignmentLockedOnSchedule,
  assignmentScheduleMoveLocked,
  boundTasksNotesHtml,
  calendarDayDelta,
  isBoundTasksNotes,
  nextAvailableScheduleRange,
  spanDatesForBoundTask,
  syncNonGanttTaskDatesFromBindings,
  taskBoundDatesMatchSpan,
  taskIsBoundOutOfSync,
  tryShiftAssignmentByDays,
} from "@/lib/domain/assignment-bound-tasks";
import type {
  Assignment,
  AssignmentBoundTask,
  LeaveDay,
  Task,
  TaskList,
} from "@/lib/types";

function asg(
  partial: Partial<Assignment> & Pick<Assignment, "id" | "start_date" | "end_date">,
): Assignment {
  return {
    organization_id: "org",
    person_id: "p1",
    project_id: "proj",
    hours_per_day: 4,
    allocation_pct: 50,
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

function bind(
  partial: Partial<AssignmentBoundTask> &
    Pick<AssignmentBoundTask, "assignment_id" | "task_id">,
): AssignmentBoundTask {
  return {
    organization_id: "org",
    sort_order: 0,
    bound_source: "schedule",
    out_of_sync: false,
    ...partial,
  };
}

function task(
  partial: Partial<Task> & Pick<Task, "id" | "list_id">,
): Task {
  return {
    organization_id: "org",
    project_id: "proj",
    parent_id: null,
    title: "T",
    status: "upcoming",
    assignee_person_id: null,
    start_date: null,
    due_date: null,
    notes: "",
    sort_order: 0,
    is_divider: false,
    is_client_review: false,
    client_review_approved: false,
    assignee_notified_at: null,
    created_at: "",
    ...partial,
  } as Task;
}

describe("assignment-bound-tasks", () => {
  it("builds bound notes as heading + unordered list", () => {
    const html = boundTasksNotesHtml(["Alpha", "Beta"]);
    expect(isBoundTasksNotes(html)).toBe(true);
    expect(html).toContain("Tasks Bound to Assignment");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>Alpha</li>");
    expect(html).toContain("<li>Beta</li>");
  });

  it("uses out-of-sync heading when requested", () => {
    const html = boundTasksNotesHtml(["Alpha"], "out_of_sync");
    expect(html).toContain("Task Dates out of Sync");
  });

  it("spans dates across multiple bound assignments", () => {
    const assignments = [
      asg({ id: "a1", start_date: "2026-03-02", end_date: "2026-03-02" }),
      asg({ id: "a2", start_date: "2026-03-05", end_date: "2026-03-05" }),
    ];
    const binds = [
      bind({ assignment_id: "a1", task_id: "t1" }),
      bind({ assignment_id: "a2", task_id: "t1" }),
    ];
    expect(spanDatesForBoundTask(binds, assignments, "t1")).toEqual({
      start: "2026-03-02",
      end: "2026-03-05",
    });
  });

  it("syncs non-Gantt tasks to span and skips Gantt lists", () => {
    const lists: Pick<TaskList, "id" | "gantt_enabled">[] = [
      { id: "l1", gantt_enabled: false },
      { id: "l2", gantt_enabled: true },
    ];
    const tasks = [
      task({
        id: "t1",
        list_id: "l1",
        start_date: "2026-03-01",
        due_date: "2026-03-01",
      }),
      task({
        id: "t2",
        list_id: "l2",
        start_date: "2026-03-01",
        due_date: "2026-03-10",
      }),
    ];
    const assignments = [
      asg({ id: "a1", start_date: "2026-03-02", end_date: "2026-03-04" }),
    ];
    const binds = [
      bind({ assignment_id: "a1", task_id: "t1" }),
      bind({ assignment_id: "a1", task_id: "t2" }),
    ];
    const patches = syncNonGanttTaskDatesFromBindings(
      binds,
      tasks,
      lists,
      assignments,
    );
    expect(patches).toEqual([
      { taskId: "t1", start_date: "2026-03-02", due_date: "2026-03-04" },
    ]);
  });

  it("locks schedule move for project-bound Gantt tasks only", () => {
    const lists = [{ id: "l1", gantt_enabled: true }];
    const tasks = [task({ id: "t1", list_id: "l1" })];
    expect(
      assignmentLockedOnSchedule(
        [bind({ assignment_id: "a1", task_id: "t1", bound_source: "project" })],
        tasks,
        lists,
        "a1",
      ),
    ).toBe(true);
    expect(
      assignmentLockedOnSchedule(
        [bind({ assignment_id: "a1", task_id: "t1", bound_source: "schedule" })],
        tasks,
        lists,
        "a1",
      ),
    ).toBe(false);
  });

  it("detects out of sync from flag or date mismatch", () => {
    const lists = [{ id: "l1", gantt_enabled: false }];
    const tasks = [
      task({
        id: "t1",
        list_id: "l1",
        start_date: "2026-03-01",
        due_date: "2026-03-01",
      }),
    ];
    const assignments = [
      asg({ id: "a1", start_date: "2026-03-02", end_date: "2026-03-02" }),
    ];
    expect(
      assignmentIsOutOfSync(
        [bind({ assignment_id: "a1", task_id: "t1", out_of_sync: true })],
        tasks,
        lists,
        assignments,
        "a1",
      ),
    ).toBe(true);
    expect(
      assignmentIsOutOfSync(
        [bind({ assignment_id: "a1", task_id: "t1" })],
        tasks,
        lists,
        assignments,
        "a1",
      ),
    ).toBe(true);
  });

  it("detects Gantt date mismatch as out of sync", () => {
    const lists = [{ id: "l1", gantt_enabled: true }];
    const tasks = [
      task({
        id: "t1",
        list_id: "l1",
        start_date: "2026-03-01",
        due_date: "2026-03-10",
      }),
    ];
    const assignments = [
      asg({ id: "a1", start_date: "2026-03-02", end_date: "2026-03-04" }),
    ];
    const binds = [bind({ assignment_id: "a1", task_id: "t1" })];
    expect(
      assignmentIsOutOfSync(binds, tasks, lists, assignments, "a1"),
    ).toBe(true);
    expect(
      taskIsBoundOutOfSync("t1", binds, tasks, assignments),
    ).toBe(true);
    expect(
      taskBoundDatesMatchSpan("t1", binds, tasks, assignments),
    ).toBe(false);
  });

  it("locks schedule move for synced Gantt binds only", () => {
    const lists = [{ id: "l1", gantt_enabled: true }];
    const inSyncTask = task({
      id: "t1",
      list_id: "l1",
      start_date: "2026-03-02",
      due_date: "2026-03-04",
    });
    const oosTask = task({
      id: "t2",
      list_id: "l1",
      start_date: "2026-03-01",
      due_date: "2026-03-10",
    });
    const assignments = [
      asg({ id: "a1", start_date: "2026-03-02", end_date: "2026-03-04" }),
      asg({ id: "a2", start_date: "2026-03-02", end_date: "2026-03-04" }),
    ];
    const syncedBinds = [bind({ assignment_id: "a1", task_id: "t1" })];
    const oosBinds = [bind({ assignment_id: "a2", task_id: "t2" })];
    expect(
      assignmentScheduleMoveLocked(
        syncedBinds,
        [inSyncTask],
        lists,
        assignments,
        "a1",
      ),
    ).toBe(true);
    expect(
      assignmentScheduleMoveLocked(
        oosBinds,
        [oosTask],
        lists,
        assignments,
        "a2",
      ),
    ).toBe(false);
  });

  it("finds next available range after leave", () => {
    const leave: LeaveDay[] = [
      {
        id: "lv1",
        organization_id: "org",
        person_id: "p1",
        date: "2026-03-02",
        kind: "vacation",
        hours_per_day: null,
        notes: "",
        status: "approved",
      },
    ];
    const result = nextAvailableScheduleRange({
      personId: "p1",
      projectId: "proj",
      start: "2026-03-02",
      end: "2026-03-02",
      assignments: [],
      leaveDays: leave,
    });
    expect(result?.start).toBe("2026-03-03");
    expect(result?.end).toBe("2026-03-03");
  });

  it("shifts assignment by calendar days when free", () => {
    const assignment = asg({
      id: "a1",
      start_date: "2026-03-02",
      end_date: "2026-03-03",
    });
    const result = tryShiftAssignmentByDays({
      assignment,
      calendarDayDelta: 7,
      assignments: [assignment],
      leaveDays: [],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.start).toBe("2026-03-09");
      expect(result.end).toBe("2026-03-10");
    }
  });

  it("skips past a single occupied day when shifting", () => {
    const moving = asg({
      id: "a1",
      start_date: "2026-03-02",
      end_date: "2026-03-02",
    });
    const blocker = asg({
      id: "a2",
      start_date: "2026-03-09",
      end_date: "2026-03-09",
    });
    const result = tryShiftAssignmentByDays({
      assignment: moving,
      calendarDayDelta: 7,
      assignments: [moving, blocker],
      leaveDays: [],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.start).not.toBe("2026-03-09");
      expect(result.start >= "2026-03-10").toBe(true);
    }
  });

  it("computes calendar day delta", () => {
    expect(calendarDayDelta("2026-03-02", "2026-03-07")).toBe(5);
    expect(calendarDayDelta("2026-03-07", "2026-03-02")).toBe(-5);
  });
});
