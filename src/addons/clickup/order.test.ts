import { describe, expect, it } from "vitest";
import {
  compareClickUpOrderIndex,
  parseClickUpOrderIndex,
  planListSortOrders,
  sortClickUpTasksByOrderIndex,
} from "@/addons/clickup/order";

describe("clickup order", () => {
  it("parses orderindex strings", () => {
    expect(parseClickUpOrderIndex("1000.5")).toBe(1000.5);
    expect(parseClickUpOrderIndex("")).toBeNull();
    expect(parseClickUpOrderIndex(null)).toBeNull();
  });

  it("compares orderindex lower-first", () => {
    expect(compareClickUpOrderIndex("1", "2")).toBeLessThan(0);
    expect(compareClickUpOrderIndex(null, "1")).toBeGreaterThan(0);
  });

  it("sorts by orderindex when reconstructing", () => {
    const sorted = sortClickUpTasksByOrderIndex([
      { id: "b", orderindex: "2" },
      { id: "a", orderindex: "1" },
      { id: "c", orderindex: "3" },
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("plans sort_order from ClickUp display order within parent groups", () => {
    const updates = planListSortOrders({
      cuTasksInDisplayOrder: [
        { id: "cu-2", parent: null },
        { id: "cu-1", parent: null },
        { id: "cu-3", parent: null },
      ],
      linkedByCuId: new Map([
        ["cu-1", { id: "r1", parent_id: null, sort_order: 0 }],
        ["cu-2", { id: "r2", parent_id: null, sort_order: 1 }],
        ["cu-3", { id: "r3", parent_id: null, sort_order: 2 }],
      ]),
      reaperTasksInList: [
        { id: "r1", parent_id: null, sort_order: 0 },
        { id: "r2", parent_id: null, sort_order: 1 },
        { id: "r3", parent_id: null, sort_order: 2 },
      ],
    });
    // CU order is r2, r1, r3 → sort_order 0,1,2
    expect(updates).toEqual([
      { reaperId: "r2", sortOrder: 0 },
      { reaperId: "r1", sortOrder: 1 },
    ]);
  });

  it("parks unlinked siblings after linked ClickUp order", () => {
    const updates = planListSortOrders({
      cuTasksInDisplayOrder: [
        { id: "cu-b", parent: null },
        { id: "cu-a", parent: null },
      ],
      linkedByCuId: new Map([
        ["cu-a", { id: "a", parent_id: null, sort_order: 0 }],
        ["cu-b", { id: "b", parent_id: null, sort_order: 1 }],
      ]),
      reaperTasksInList: [
        { id: "a", parent_id: null, sort_order: 0 },
        { id: "local", parent_id: null, sort_order: 1 },
        { id: "b", parent_id: null, sort_order: 2 },
      ],
    });
    // Desired: b(0), a(1), local(2)
    expect(updates).toEqual([
      { reaperId: "b", sortOrder: 0 },
      { reaperId: "a", sortOrder: 1 },
      { reaperId: "local", sortOrder: 2 },
    ]);
  });

  it("orders subtasks per parent independently", () => {
    const updates = planListSortOrders({
      cuTasksInDisplayOrder: [
        { id: "cu-p", parent: null },
        { id: "cu-c2", parent: "cu-p" },
        { id: "cu-c1", parent: "cu-p" },
      ],
      linkedByCuId: new Map([
        ["cu-p", { id: "p", parent_id: null, sort_order: 0 }],
        ["cu-c1", { id: "c1", parent_id: "p", sort_order: 0 }],
        ["cu-c2", { id: "c2", parent_id: "p", sort_order: 1 }],
      ]),
      reaperTasksInList: [
        { id: "p", parent_id: null, sort_order: 0 },
        { id: "c1", parent_id: "p", sort_order: 0 },
        { id: "c2", parent_id: "p", sort_order: 1 },
      ],
    });
    expect(updates).toEqual([
      { reaperId: "c2", sortOrder: 0 },
      { reaperId: "c1", sortOrder: 1 },
    ]);
  });

  it("returns empty when already aligned", () => {
    const updates = planListSortOrders({
      cuTasksInDisplayOrder: [
        { id: "cu-1", parent: null },
        { id: "cu-2", parent: null },
      ],
      linkedByCuId: new Map([
        ["cu-1", { id: "r1", parent_id: null, sort_order: 0 }],
        ["cu-2", { id: "r2", parent_id: null, sort_order: 1 }],
      ]),
      reaperTasksInList: [
        { id: "r1", parent_id: null, sort_order: 0 },
        { id: "r2", parent_id: null, sort_order: 1 },
      ],
    });
    expect(updates).toEqual([]);
  });
});
