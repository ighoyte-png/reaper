import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { claimPendingInvitesForUser } from "@/lib/accounts/invites";

/**
 * Accept any pending organization invites for the signed-in user's email.
 * Used when Auth invite lands on set-password (losing the accept token) and
 * on pending-approval recovery so members aren't bootstrapped into a new org.
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

  try {
    const admin = createAdminClient();
    const claimed = await claimPendingInvitesForUser(
      admin,
      user.id,
      user.email,
    );
    const primary = claimed[0] ?? null;
    let workspace: { id: string; name: string; slug: string } | null = null;
    if (primary) {
      const { data: org } = await admin
        .from("organizations")
        .select("id, name, slug")
        .eq("id", primary.organizationId)
        .maybeSingle();
      if (org) {
        workspace = {
          id: String(org.id),
          name: String(org.name),
          slug: String(org.slug ?? ""),
        };
      }
    }
    return NextResponse.json({
      ok: true,
      claimed: claimed.length,
      organizationId: primary?.organizationId ?? null,
      workspace,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Claim failed" },
      { status: 400 },
    );
  }
}
