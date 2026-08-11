import { describe, expect, it } from "vitest";
import {
  homeWorkspaceSlug,
  isMembershipSlug,
  workspacePathAfterSwitch,
} from "@/lib/domain/workspace-memberships";
import type { OrganizationMembership } from "@/lib/types";

const memberships: OrganizationMembership[] = [
  {
    organization_id: "org-a",
    role: "admin",
    org: { id: "org-a", name: "Acme", slug: "acme" },
  },
  {
    organization_id: "org-b",
    role: "member",
    org: { id: "org-b", name: "Beta", slug: "beta" },
  },
];

describe("workspace memberships", () => {
  it("prefers active org slug, else first membership", () => {
    expect(homeWorkspaceSlug(memberships, "org-b")).toBe("beta");
    expect(homeWorkspaceSlug(memberships, null)).toBe("acme");
    expect(homeWorkspaceSlug([], "org-a")).toBeNull();
  });

  it("detects membership slugs", () => {
    expect(isMembershipSlug(memberships, "beta")).toBe(true);
    expect(isMembershipSlug(memberships, "other")).toBe(false);
  });

  it("preserves path suffix when switching workspaces", () => {
    expect(
      workspacePathAfterSwitch("/acme/projects/x", "acme", "beta"),
    ).toBe("/beta/projects/x");
    expect(workspacePathAfterSwitch("/acme", "acme", "beta")).toBe(
      "/beta/dashboard",
    );
    expect(workspacePathAfterSwitch("/login", "acme", "beta")).toBe(
      "/beta/dashboard",
    );
  });
});
