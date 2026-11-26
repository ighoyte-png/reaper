import { describe, expect, it } from "vitest";
import { applyProjectListView } from "@/lib/domain/tasks";
import type { Task } from "@/lib/types";

function row(
  partial: Partial<Task> & Pick<Task, "id" | "status" | "sort_order">,
): Pick<Task, "id" | "status" | "sort_order" | "title" | "is_divider"> {
  return {
    title: partial.title ?? partial.id,
    is_divider: partial.is_divider ?? false,
    id: partial.id,
    status: partial.status,
    sort_order: partial.sort_order,
  };
}

describe("applyProjectListView", () => {
  const siblings = [
    row({ id: "a", status: "upcoming", sort_order: 0 }),
    row({ id: "b", status: "complete", sort_order: 1 }),
    row({ id: "c", status: "active", sort_order: 2 }),
    row({ id: "d", status: "complete", sort_order: 3 }),
    row({ id: "e", status: "upcoming", sort_order: 4 }),
  ];

  const base = {
    hideCompleted: false,
    completedToBottom: false,
    collapsedListIds: [] as string[],
  };

  it("returns sort_order when both flags off", () => {
    expect(applyProjectListView(siblings, base).map((t) => t.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
  });

  it("hides completed and keeps relative order of the rest", () => {
    expect(
      applyProjectListView(siblings, { ...base, hideCompleted: true }).map(
        (t) => t.id,
      ),
    ).toEqual(["a", "c", "e"]);
  });

  it("pins completed to the bottom below Active and In Review", () => {
    expect(
      applyProjectListView(siblings, { ...base, completedToBottom: true }).map(
        (t) => t.id,
      ),
    ).toEqual(["a", "c", "e", "b", "d"]);
  });

  it("lets hide trump completed-to-bottom", () => {
    expect(
      applyProjectListView(siblings, {
        ...base,
        hideCompleted: true,
        completedToBottom: true,
      }).map((t) => t.id),
    ).toEqual(["a", "c", "e"]);
  });

  it("keeps dividers with open tasks when pinning completes", () => {
    const withDivider = [
      row({ id: "a", status: "upcoming", sort_order: 0 }),
      row({ id: "div", status: "upcoming", sort_order: 1, is_divider: true }),
      row({ id: "b", status: "complete", sort_order: 2 }),
      row({ id: "c", status: "active", sort_order: 3 }),
    ];
    expect(
      applyProjectListView(withDivider, {
        ...base,
        completedToBottom: true,
      }).map((t) => t.id),
    ).toEqual(["a", "div", "c", "b"]);
  });

  it("does not hide dividers when hideCompleted is on", () => {
    const withDivider = [
      row({ id: "a", status: "complete", sort_order: 0 }),
      row({ id: "div", status: "upcoming", sort_order: 1, is_divider: true }),
      row({ id: "b", status: "upcoming", sort_order: 2 }),
    ];
    expect(
      applyProjectListView(withDivider, { ...base, hideCompleted: true }).map(
        (t) => t.id,
      ),
    ).toEqual(["div", "b"]);
  });
});
