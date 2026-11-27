import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { acceptOrganizationInvite } from "@/lib/accounts/invites";

export async function POST(request: Request) {
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

  const body = (await request.json()) as { token?: string };
  const token = body.token?.trim();
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const result = await acceptOrganizationInvite(
      admin,
      token,
      user.id,
      user.email,
    );

    const { data: org } = await admin
      .from("organizations")
      .select("id, name, slug")
      .eq("id", result.organizationId)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      organizationId: result.organizationId,
      role: result.role,
      workspace: org
        ? { id: org.id, name: org.name, slug: org.slug }
        : null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Accept failed" },
      { status: 400 },
    );
  }
}
