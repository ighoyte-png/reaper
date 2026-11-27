import { NextResponse } from "next/server";
import { requireAuthApiAccess } from "@/lib/api/require-auth";
import { loadSettings } from "@/addons/clickup/db";
import { clickUpFolderUrl } from "@/addons/clickup/urls";

/**
 * Org-member readable map of ClickUp-synced projects → folder overview URLs.
 * Used for list/detail badges (not manager-only).
 */
export async function GET(request: Request) {
  try {
    const auth = await requireAuthApiAccess(request);
    if ("error" in auth) return auth.error;
    const orgId = auth.caller.organization_id;

    const settings = await loadSettings(auth.admin, orgId);
    if (!settings?.enabled) {
      return NextResponse.json({
        projectIds: [] as string[],
        links: {} as Record<string, string>,
      });
    }

    const { data: syncRows, error: syncErr } = await auth.admin
      .from("addon_clickup_project_sync")
      .select("project_id")
      .eq("organization_id", orgId)
      .eq("enabled", true);
    if (syncErr) throw new Error(syncErr.message);

    const projectIds = (syncRows ?? []).map((r) => String(r.project_id));
    const links: Record<string, string> = {};

    if (projectIds.length > 0) {
      const teamId = settings.clickup_team_id?.trim() ?? "";
      const { data: linkRows, error: linkErr } = await auth.admin
        .from("addon_clickup_links")
        .select("reaper_id, clickup_id")
        .eq("organization_id", orgId)
        .eq("entity_type", "project")
        .in("reaper_id", projectIds);
      if (linkErr) throw new Error(linkErr.message);

      for (const row of linkRows ?? []) {
        const projectId = String(row.reaper_id);
        const folderId = String(row.clickup_id ?? "").trim();
        const href = clickUpFolderUrl(teamId, folderId);
        if (href) links[projectId] = href;
      }
    }

    return NextResponse.json({ projectIds, links });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
