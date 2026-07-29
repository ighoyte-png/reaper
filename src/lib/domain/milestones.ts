import type { Milestone, ProjectAssetKind } from "@/lib/types";
import { ASSET_KIND_LABELS } from "@/lib/domain/assets";

const ASSET_KINDS = new Set(
  Object.keys(ASSET_KIND_LABELS) as ProjectAssetKind[],
);

export function parseAssetKind(
  value: unknown,
): ProjectAssetKind | null {
  if (typeof value !== "string" || !value) return null;
  return ASSET_KINDS.has(value as ProjectAssetKind)
    ? (value as ProjectAssetKind)
    : null;
}

export function milestoneHasEssential(m: {
  essential_kind: ProjectAssetKind | null;
  essential_url: string;
}): boolean {
  return Boolean(m.essential_kind && m.essential_url.trim());
}

export function normalizeApprovalContact(name: string, email: string) {
  return {
    name: name.trim().replace(/\s+/g, " "),
    email: email.trim().toLowerCase(),
  };
}

export function approvalContactsMatch(
  expectedName: string,
  expectedEmail: string,
  givenName: string,
  givenEmail: string,
): boolean {
  const expected = normalizeApprovalContact(expectedName, expectedEmail);
  const given = normalizeApprovalContact(givenName, givenEmail);
  if (!expected.name || !expected.email || !given.name || !given.email) {
    return false;
  }
  return (
    expected.name.toLowerCase() === given.name.toLowerCase() &&
    expected.email === given.email
  );
}

export function milestoneApprovalBulletinTitle(opts: {
  milestoneName: string;
  clientName: string | null;
  projectName: string;
}): string {
  const client = opts.clientName?.trim() || "Client";
  return `Hooray, the ${opts.milestoneName} has been APPROVED for the ${client} ${opts.projectName} Project!`;
}

export function emptyMilestoneApprovalFields(): Pick<
  Milestone,
  | "approval_enabled"
  | "approval_name"
  | "approval_email"
  | "essential_kind"
  | "essential_label"
  | "essential_url"
  | "approved_by_name"
  | "approved_at"
  | "approved_by_client"
> {
  return {
    approval_enabled: false,
    approval_name: "",
    approval_email: "",
    essential_kind: null,
    essential_label: "",
    essential_url: "",
    approved_by_name: null,
    approved_at: null,
    approved_by_client: false,
  };
}
