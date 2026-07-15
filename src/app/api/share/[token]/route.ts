import { NextResponse } from "next/server";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { loadOrgWorkspace } from "@/lib/supabase/api";
import { sanitizePublicWorkspace } from "@/lib/share/sanitize";

type Params = { params: Promise<{ token: string }> };

/** Anonymous public workspace snapshot for an enabled share token. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { token } = await params;
    const shareToken = token?.trim();
    if (!shareToken || shareToken.length < 16) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!isSupabaseConfigured() || !isServiceRoleConfigured()) {
      return NextResponse.json(
        { error: "Public share requires Supabase" },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const { data: org, error: orgError } = await admin
      .from("organizations")
      .select("id, share_enabled, share_token")
      .eq("share_token", shareToken)
      .maybeSingle();

    if (orgError) {
      if (/share_token|share_enabled/i.test(orgError.message)) {
        return NextResponse.json(
          {
            error:
              "Public share columns missing — apply supabase/migrations/014_org_public_share.sql",
          },
          { status: 400 },
        );
      }
      return NextResponse.json({ error: orgError.message }, { status: 400 });
    }

    if (!org || !org.share_enabled) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const workspace = await loadOrgWorkspace(admin, org.id, null);
    const sanitized = sanitizePublicWorkspace(workspace);

    return NextResponse.json({ workspace: sanitized });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
