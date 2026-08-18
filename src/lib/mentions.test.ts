import { describe, expect, it } from "vitest";
import {
  mentionUnreadSyncPlan,
  newlyMentionedPersonIds,
} from "@/lib/mentions";

describe("newlyMentionedPersonIds", () => {
  it("returns only people added since the previous set", () => {
    expect(newlyMentionedPersonIds(["a"], ["a", "b"], "me")).toEqual(["b"]);
  });

  it("skips the author", () => {
    expect(newlyMentionedPersonIds([], ["me", "b"], "me")).toEqual(["b"]);
  });
});

describe("mentionUnreadSyncPlan", () => {
  it("does not re-insert a dismissed person who is still mentioned", () => {
    expect(
      mentionUnreadSyncPlan({
        currentPersonIds: ["a", "b"],
        existingUnreadPersonIds: [],
        newlyMentionedPersonIds: [],
      }),
    ).toEqual({ toAdd: [], toRemove: [] });
  });

  it("inserts only newly tagged people", () => {
    expect(
      mentionUnreadSyncPlan({
        currentPersonIds: ["a", "b"],
        existingUnreadPersonIds: ["a"],
        newlyMentionedPersonIds: ["b"],
      }),
    ).toEqual({ toAdd: ["b"], toRemove: [] });
  });

  it("drops inbox rows when a mention is removed", () => {
    expect(
      mentionUnreadSyncPlan({
        currentPersonIds: ["b"],
        existingUnreadPersonIds: ["a", "b"],
        newlyMentionedPersonIds: [],
      }),
    ).toEqual({ toAdd: [], toRemove: ["a"] });
  });

  it("re-notifies after unmention then mention again", () => {
    expect(
      mentionUnreadSyncPlan({
        currentPersonIds: ["a"],
        existingUnreadPersonIds: [],
        newlyMentionedPersonIds: ["a"],
      }),
    ).toEqual({ toAdd: ["a"], toRemove: [] });
  });
});
