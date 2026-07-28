import { NextResponse } from "next/server";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { loadOrgWorkspace } from "@/lib/supabase/api";
import { sanitizePublicWorkspace } from "@/lib/share/sanitize";
import { resolveAvatarUrl } from "@/lib/supabase/avatar";

type Params = { params: Promise<{ token: string }> };

function notFound() {
  return NextResponse.json(
    { error: "Not found" },
    {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

/** Anonymous public workspace snapshot for an enabled share token. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { token } = await params;
    const shareToken = token?.trim();
    if (!shareToken || shareToken.length < 16) {
      return notFound();
    }

    if (!isSupabaseConfigured() || !isServiceRoleConfigured()) {
      return NextResponse.json(
        { error: "Public share requires Supabase" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const admin = createAdminClient();
    const { data: org, error: orgError } = await admin
      .from("organizations")
      .select("id, share_enabled, share_token, disabled_at")
      .eq("share_token", shareToken)
      .maybeSingle();

    if (orgError) {
      if (/share_token|share_enabled/i.test(orgError.message)) {
        return NextResponse.json(
          {
            error:
              "Public share columns missing — apply supabase/migrations/014_org_public_share.sql",
          },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      }
      return NextResponse.json(
        { error: "Not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (!org || !org.share_enabled || org.disabled_at) {
      return notFound();
    }

    const workspace = await loadOrgWorkspace(admin, org.id, null);
    const sanitized = sanitizePublicWorkspace(workspace);
    sanitized.people = await Promise.all(
      sanitized.people.map(async (p) => ({
        ...p,
        avatar_url: await resolveAvatarUrl(admin, p.avatar_url),
      })),
    );

    return NextResponse.json(
      { workspace: sanitized },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
}
