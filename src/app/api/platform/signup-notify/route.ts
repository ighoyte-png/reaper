import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { notifyPlatformAdminsOfSignup } from "@/lib/platform/signup-notify";

/**
 * After public registration / Google workspace create: email platform admins.
 * Idempotent per organization (platform_audit_log account.signup.notify).
 */
export async function POST() {
  if (!isSupabaseConfigured() || !isServiceRoleConfigured()) {
    return NextResponse.json(
      { error: "Supabase is not configured" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user?.email) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: membership, error: memError } = await admin
    .from("organization_memberships")
    .select("organization_id, is_owner")
    .eq("user_id", user.id)
    .eq("is_owner", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (memError) {
    return NextResponse.json({ error: memError.message }, { status: 400 });
  }
  if (!membership?.organization_id) {
    return NextResponse.json(
      { error: "No owner workspace found" },
      { status: 404 },
    );
  }

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .select("id, name, slug, approval_status, created_at")
    .eq("id", membership.organization_id)
    .maybeSingle();

  if (orgError || !org) {
    return NextResponse.json(
      { error: orgError?.message ?? "Organization not found" },
      { status: 404 },
    );
  }

  // Only notify for very recent public signups (avoid spam on old orgs).
  if (org.created_at) {
    const ageMs = Date.now() - new Date(String(org.created_at)).getTime();
    if (Number.isFinite(ageMs) && ageMs > 60 * 60 * 1000) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "Organization is older than 1 hour",
      });
    }
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const ownerName =
    (typeof profile?.full_name === "string" && profile.full_name.trim()) ||
    (typeof user.user_metadata?.full_name === "string" &&
      user.user_metadata.full_name.trim()) ||
    user.email.split("@")[0] ||
    "Owner";

  try {
    const result = await notifyPlatformAdminsOfSignup(admin, {
      org: {
        id: String(org.id),
        name: String(org.name ?? ""),
        slug: org.slug ? String(org.slug) : null,
        approval_status: org.approval_status
          ? String(org.approval_status)
          : null,
        created_at: org.created_at ? String(org.created_at) : null,
      },
      ownerEmail: user.email,
      ownerName,
      actorUserId: user.id,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[signup-notify]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Notify failed" },
      { status: 500 },
    );
  }
}
