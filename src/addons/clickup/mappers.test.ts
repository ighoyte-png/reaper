import { describe, expect, it } from "vitest";
import {
  mapReaperStatusToClickUp,
  notesToDescription,
  normalizeDescription,
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
});
