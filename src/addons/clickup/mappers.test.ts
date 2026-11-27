import { describe, expect, it } from "vitest";
import {
  mapReaperStatusToClickUp,
  mapClickUpStatusToReaper,
  notesToDescription,
  normalizeDescription,
  reaperStatusClockMs,
  shouldOmitStatusOnPush,
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

  it("post-patch hash keeps skipped status so later status events are not echo", () => {
    const appliedWithoutStatus = taskContentHash({
      title: "Carey",
      status: "complete",
      notes: "updated from CU",
    });
    const cuStatusOnly = taskContentHash({
      title: "Carey",
      status: "upcoming",
      notes: "updated from CU",
    });
    expect(appliedWithoutStatus).not.toBe(cuStatusOnly);
  });

  it("omits status on push when inbound is newer than status_changed_at", () => {
    expect(
      shouldOmitStatusOnPush({
        lastInboundAt: "2026-11-27T18:00:00.000Z",
        statusChangedAt: "2026-11-27T12:00:00.000Z",
      }),
    ).toBe(true);
    expect(
      shouldOmitStatusOnPush({
        lastInboundAt: "2026-11-27T12:00:00.000Z",
        statusChangedAt: "2026-11-27T18:00:00.000Z",
      }),
    ).toBe(false);
    expect(
      shouldOmitStatusOnPush({
        lastInboundAt: "2026-11-27T18:00:00.000Z",
        statusChangedAt: null,
      }),
    ).toBe(true);
    expect(
      shouldOmitStatusOnPush({
        lastInboundAt: null,
        statusChangedAt: "2026-11-27T18:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("status clock is 0 when status_changed_at is null (not edited_at)", () => {
    expect(reaperStatusClockMs(null)).toBe(0);
    expect(reaperStatusClockMs(undefined)).toBe(0);
    expect(reaperStatusClockMs("2026-11-27T12:00:00.000Z")).toBe(
      Date.parse("2026-11-27T12:00:00.000Z"),
    );
  });
});
