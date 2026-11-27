import type { SupabaseClient } from "@supabase/supabase-js";
import { listPlatformOperators } from "@/lib/accounts/operators";
import { writePlatformAudit } from "@/lib/accounts/audit";
import { platformAdminEmails } from "@/lib/platform-admin";
import { sendTransactionalMail } from "@/lib/mail/send";
import {
  configuredSiteOrigin,
  DEFAULT_PUBLIC_APP_ORIGIN,
} from "@/lib/security/request";

export type SignupNotifyOrg = {
  id: string;
  name: string;
  slug: string | null;
  approval_status: string | null;
  created_at?: string | null;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function resolvePlatformNotifyEmails(
  admin: SupabaseClient,
): Promise<string[]> {
  const fromEnv = platformAdminEmails();
  let fromDb: string[] = [];
  try {
    const ops = await listPlatformOperators(admin);
    fromDb = ops
      .map((o) => String(o.email ?? "").trim().toLowerCase())
      .filter((e) => e.includes("@"));
  } catch (e) {
    console.error("[signup-notify] operators", e);
  }
  return [...new Set([...fromEnv, ...fromDb])];
}

export async function notifyPlatformAdminsOfSignup(
  admin: SupabaseClient,
  args: {
    org: SignupNotifyOrg;
    ownerEmail: string;
    ownerName: string;
    actorUserId: string;
  },
): Promise<{ sent: boolean; skipped?: boolean; error?: string }> {
  const { data: existing } = await admin
    .from("platform_audit_log")
    .select("id")
    .eq("organization_id", args.org.id)
    .eq("action", "account.signup.notify")
    .limit(1)
    .maybeSingle();
  if (existing?.id) {
    return { sent: false, skipped: true };
  }

  const recipients = await resolvePlatformNotifyEmails(admin);
  if (recipients.length === 0) {
    console.warn(
      "[signup-notify] No PLATFORM_ADMIN_EMAILS or platform_operators — skip",
    );
    return { sent: false, skipped: true, error: "No platform admin emails" };
  }

  const origin =
    configuredSiteOrigin() || DEFAULT_PUBLIC_APP_ORIGIN;
  const adminUrl = `${origin}/admin`;
  const pending = (args.org.approval_status ?? "approved") === "pending";
  const orgLabel = args.org.name || "Untitled workspace";
  const ownerLabel = args.ownerName || args.ownerEmail || "Owner";

  const subject = pending
    ? `[Reaper] New workspace pending approval: ${orgLabel}`
    : `[Reaper] New workspace signup: ${orgLabel}`;

  const text = [
    "A new Reaper workspace was created.",
    "",
    `Workspace: ${orgLabel}`,
    args.org.slug ? `Slug: ${args.org.slug}` : null,
    `Status: ${args.org.approval_status ?? "approved"}`,
    `Owner: ${ownerLabel} <${args.ownerEmail}>`,
    "",
    pending
      ? `Review and approve: ${adminUrl}`
      : `Open platform console: ${adminUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family:ui-sans-serif,system-ui,sans-serif;line-height:1.5;color:#111">
      <p style="margin:0 0 12px">A new Reaper workspace was created.</p>
      <table style="border-collapse:collapse;font-size:14px">
        <tr><td style="padding:4px 12px 4px 0;color:#666">Workspace</td><td><strong>${escapeHtml(orgLabel)}</strong></td></tr>
        ${
          args.org.slug
            ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Slug</td><td>${escapeHtml(args.org.slug)}</td></tr>`
            : ""
        }
        <tr><td style="padding:4px 12px 4px 0;color:#666">Status</td><td>${escapeHtml(args.org.approval_status ?? "approved")}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Owner</td><td>${escapeHtml(ownerLabel)} &lt;${escapeHtml(args.ownerEmail)}&gt;</td></tr>
      </table>
      <p style="margin:16px 0 0">
        <a href="${escapeHtml(adminUrl)}" style="color:#0b57d0">${
          pending ? "Review and approve in Platform" : "Open Platform console"
        }</a>
      </p>
    </div>
  `;

  const result = await sendTransactionalMail({
    to: recipients,
    subject,
    html,
    text,
  });

  await writePlatformAudit(admin, {
    actorUserId: args.actorUserId,
    actorEmail: args.ownerEmail,
    action: "account.signup.notify",
    organizationId: args.org.id,
    targetType: "organization",
    targetId: args.org.id,
    meta: {
      sent: result.ok,
      skipped: "skipped" in result ? result.skipped : false,
      error: result.ok ? null : result.error,
      recipients,
      pending,
    },
  });

  if (!result.ok) {
    return {
      sent: false,
      skipped: Boolean(result.skipped),
      error: result.error,
    };
  }
  return { sent: true };
}
