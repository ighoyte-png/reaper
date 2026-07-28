import { NextResponse } from "next/server";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { loadProjectPortalWorkspace } from "@/lib/supabase/api";
import { sanitizeProjectPortal } from "@/lib/share/sanitize";
import { resolveAvatarUrl } from "@/lib/supabase/avatar";

type Params = { params: Promise<{ token: string }> };

function notFound() {
  return NextResponse.json(
    { error: "Not found" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

/** Anonymous public client-portal snapshot for one project's share token. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { token } = await params;
    const shareToken = token?.trim();
    if (!shareToken || shareToken.length < 8) {
      return notFound();
    }

    if (!isSupabaseConfigured() || !isServiceRoleConfigured()) {
      return NextResponse.json(
        { error: "Public project share requires Supabase" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
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
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      }
      return notFound();
    }

    if (!project || !project.share_enabled) {
      return notFound();
    }

    const { data: org } = await admin
      .from("organizations")
      .select("disabled_at")
      .eq("id", project.organization_id)
      .maybeSingle();
    if (org?.disabled_at) {
      return notFound();
    }

    const workspace = await loadProjectPortalWorkspace(
      admin,
      String(project.organization_id),
      String(project.id),
    );
    workspace.people = await Promise.all(
      workspace.people.map(async (p) => ({
        ...p,
        avatar_url: await resolveAvatarUrl(admin, p.avatar_url),
      })),
    );
    const portal = sanitizeProjectPortal(workspace, String(project.id));
    if (!portal) {
      return notFound();
    }

    return NextResponse.json(
      { portal },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error(err);
    return notFound();
  }
}
