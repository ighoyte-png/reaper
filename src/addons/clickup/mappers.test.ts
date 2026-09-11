import { describe, expect, it } from "vitest";
import {
  mapReaperStatusToClickUp,
  mapClickUpStatusToReaper,
  notesToDescription,
  normalizeDescription,
  stripReaperLinkFooter,
  taskContentHash,
} from "@/addons/clickup/mappers";

describe("clickup mappers", () => {
  it("strips html from notes", () => {
    expect(notesToDescription("<p>Hello<br/>World</p>")).toContain("Hello");
    expect(normalizeDescription("<b>Hi</b>  there")).toBe("hi there");
  });

  it("maps reaper statuses", () => {
    const map = {
      upcoming: "to do",
      active: "in progress",
      complete: "complete",
    };
    expect(mapReaperStatusToClickUp("upcoming", map)).toBe("to do");
    expect(mapReaperStatusToClickUp("active", map)).toBe("in progress");
    expect(mapReaperStatusToClickUp("complete", map)).toBe("complete");
  });

  it("maps clickup statuses reverse", () => {
    const map = {
      upcoming: "to do",
      active: "in progress",
      complete: "complete",
    };
    expect(mapClickUpStatusToReaper("In Progress", map)).toBe("active");
    expect(mapClickUpStatusToReaper("unknown", map)).toBeNull();
  });

  it("strips reaper footer and hashes content", () => {
    expect(
      stripReaperLinkFooter("Body\n\n—\nOpen in Reaper: https://x"),
    ).toBe("Body");
    expect(
      taskContentHash({ title: "a", status: "active" }),
    ).toMatch(/^h[0-9a-f]+:/);
  });
});
