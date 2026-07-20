import { NextResponse } from "next/server";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { loadOrgWorkspace } from "@/lib/supabase/api";
import { sanitizeProjectPortal } from "@/lib/share/sanitize";

type Params = { params: Promise<{ token: string }> };

/** Anonymous public client-portal snapshot for one project's share token. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { token } = await params;
    const shareToken = token?.trim();
    if (!shareToken || shareToken.length < 8) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!isSupabaseConfigured() || !isServiceRoleConfigured()) {
      return NextResponse.json(
        { error: "Public project share requires Supabase" },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("id, organization_id, share_enabled, share_token")
      .eq("share_token", shareToken)
      .maybeSingle();

    if (projectError) {
      if (/share_token|share_enabled/i.test(projectError.message)) {
        return NextResponse.json(
          {
            error:
              "Public project share columns missing — apply supabase/migrations/015_pm_execution.sql",
          },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: projectError.message },
        { status: 400 },
      );
    }

    if (!project || !project.share_enabled) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const workspace = await loadOrgWorkspace(
      admin,
      String(project.organization_id),
      null,
    );
    const portal = sanitizeProjectPortal(workspace, String(project.id));
    if (!portal) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ portal });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
