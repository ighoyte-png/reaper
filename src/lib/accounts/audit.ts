import type { SupabaseClient } from "@supabase/supabase-js";

export async function writePlatformAudit(
  admin: SupabaseClient,
  args: {
    actorUserId?: string | null;
    actorEmail?: string | null;
    action: string;
    organizationId?: string | null;
    targetType?: string | null;
    targetId?: string | null;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await admin.from("platform_audit_log").insert({
    actor_user_id: args.actorUserId ?? null,
    actor_email: args.actorEmail?.toLowerCase() ?? null,
    action: args.action,
    organization_id: args.organizationId ?? null,
    target_type: args.targetType ?? null,
    target_id: args.targetId ?? null,
    meta: args.meta ?? {},
  });
  if (error) {
    console.error("[platform_audit_log]", error.message);
  }
}
