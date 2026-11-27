import { describe, expect, it } from "vitest";
import { orderOutboxRowsForDrain } from "@/addons/clickup/outbox-order";

describe("orderOutboxRowsForDrain", () => {
  it("creates unlinked tasks in Reaper sort_order before other ops", () => {
    const rows = [
      {
        id: "o1",
        entity_type: "task",
        reaper_id: "t3",
        op: "upsert",
        created_at: "2026-11-27T10:00:03Z",
      },
      {
        id: "o2",
        entity_type: "task",
        reaper_id: "t1",
        op: "upsert",
        created_at: "2026-11-27T10:00:01Z",
      },
      {
        id: "o3",
        entity_type: "task",
        reaper_id: "t2",
        op: "upsert",
        created_at: "2026-11-27T10:00:02Z",
      },
      {
        id: "o4",
        entity_type: "comment",
        reaper_id: "c1",
        op: "upsert",
        created_at: "2026-11-27T10:00:00Z",
      },
    ];
    const ordered = orderOutboxRowsForDrain(rows, {
      taskSortOrder: new Map([
        ["t1", 0],
        ["t2", 1],
        ["t3", 2],
      ]),
      linkedTaskIds: new Set(),
    });
    expect(ordered.map((r) => r.reaper_id)).toEqual(["t1", "t2", "t3", "c1"]);
  });

  it("keeps already-linked task updates after unlinked creates", () => {
    const rows = [
      {
        id: "o1",
        entity_type: "task",
        reaper_id: "linked",
        op: "upsert",
        created_at: "2026-11-27T10:00:00Z",
      },
      {
        id: "o2",
        entity_type: "task",
        reaper_id: "new-b",
        op: "upsert",
        created_at: "2026-11-27T10:00:02Z",
      },
      {
        id: "o3",
        entity_type: "task",
        reaper_id: "new-a",
        op: "upsert",
        created_at: "2026-11-27T10:00:01Z",
      },
    ];
    const ordered = orderOutboxRowsForDrain(rows, {
      taskSortOrder: new Map([
        ["linked", 0],
        ["new-a", 5],
        ["new-b", 6],
      ]),
      linkedTaskIds: new Set(["linked"]),
    });
    expect(ordered.map((r) => r.reaper_id)).toEqual([
      "new-a",
      "new-b",
      "linked",
    ]);
  });

  it("does not reorder delete ops as creates", () => {
    const rows = [
      {
        id: "o1",
        entity_type: "task",
        reaper_id: "t2",
        op: "delete",
        created_at: "2026-11-27T10:00:00Z",
      },
      {
        id: "o2",
        entity_type: "task",
        reaper_id: "t1",
        op: "upsert",
        created_at: "2026-11-27T10:00:01Z",
      },
    ];
    const ordered = orderOutboxRowsForDrain(rows, {
      taskSortOrder: new Map([
        ["t1", 0],
        ["t2", 1],
      ]),
      linkedTaskIds: new Set(),
    });
    expect(ordered.map((r) => r.reaper_id)).toEqual(["t1", "t2"]);
  });
});
