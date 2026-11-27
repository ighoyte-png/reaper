import { describe, expect, it } from "vitest";
import { isKnownAddonKey, KNOWN_ADDON_KEYS } from "./addons";
import { isApprovalStatus, orgIsUsable } from "./approval";

describe("addon keys", () => {
  it("recognizes clickup", () => {
    expect(isKnownAddonKey("clickup")).toBe(true);
    expect(KNOWN_ADDON_KEYS).toContain("clickup");
  });

  it("rejects unknown keys", () => {
    expect(isKnownAddonKey("slack")).toBe(false);
  });
});

describe("approval helpers", () => {
  it("parses approval statuses", () => {
    expect(isApprovalStatus("pending")).toBe(true);
    expect(isApprovalStatus("approved")).toBe(true);
    expect(isApprovalStatus("rejected")).toBe(true);
    expect(isApprovalStatus("other")).toBe(false);
  });

  it("orgIsUsable requires approved and not disabled", () => {
    expect(orgIsUsable({ approval_status: "approved", disabled_at: null })).toBe(
      true,
    );
    expect(orgIsUsable({ approval_status: "pending", disabled_at: null })).toBe(
      false,
    );
    expect(
      orgIsUsable({
        approval_status: "approved",
        disabled_at: "2026-01-01T00:00:00Z",
      }),
    ).toBe(false);
    expect(orgIsUsable({ approval_status: "rejected", disabled_at: null })).toBe(
      false,
    );
    // Legacy rows without approval_status treat as approved.
    expect(orgIsUsable({ disabled_at: null })).toBe(true);
  });
});
