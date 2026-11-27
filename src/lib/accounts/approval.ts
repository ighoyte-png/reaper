import type { SupabaseClient } from "@supabase/supabase-js";
import { writePlatformAudit } from "@/lib/accounts/audit";
import { applyDefaultAddonAllowlist } from "@/lib/accounts/addons";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export function isApprovalStatus(value: unknown): value is ApprovalStatus {
  return value === "pending" || value === "approved" || value === "rejected";
}

export function orgIsUsable(org: {
  approval_status?: string | null;
  disabled_at?: string | null;
}): boolean {
  if (org.disabled_at) return false;
  const status = org.approval_status ?? "approved";
  return status === "approved";
}

export async function approveAccount(
  admin: SupabaseClient,
  args: {
    orgId: string;
    actorUserId: string;
    actorEmail: string;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await admin
    .from("organizations")
    .update({
      approval_status: "approved",
      approved_at: now,
      approved_by: args.actorUserId,
      rejection_reason: null,
      disabled_at: null,
    })
    .eq("id", args.orgId);
  if (error) throw new Error(error.message);

  await applyDefaultAddonAllowlist(admin, args.orgId);

  await writePlatformAudit(admin, {
    actorUserId: args.actorUserId,
    actorEmail: args.actorEmail,
    action: "account.approve",
    organizationId: args.orgId,
    targetType: "organization",
    targetId: args.orgId,
  });
}

export async function rejectAccount(
  admin: SupabaseClient,
  args: {
    orgId: string;
    actorUserId: string;
    actorEmail: string;
    reason?: string | null;
  },
): Promise<void> {
  const reason = args.reason?.trim() || null;
  const now = new Date().toISOString();
  const { error } = await admin
    .from("organizations")
    .update({
      approval_status: "rejected",
      rejection_reason: reason,
      disabled_at: now,
      approved_at: null,
      approved_by: null,
    })
    .eq("id", args.orgId);
  if (error) throw new Error(error.message);

  await writePlatformAudit(admin, {
    actorUserId: args.actorUserId,
    actorEmail: args.actorEmail,
    action: "account.reject",
    organizationId: args.orgId,
    targetType: "organization",
    targetId: args.orgId,
    meta: { reason },
  });
}
