import { NextResponse } from "next/server";
import { requireAuthApiAccess } from "@/lib/api/require-auth";
import { loadSettings } from "@/addons/clickup/db";
import { clickUpFolderUrl, clickUpListUrl } from "@/addons/clickup/urls";

/**
 * Org-member readable map of ClickUp-synced projects → best open URLs.
 * Prefers the first synced list (shows tasks); falls back to folder overview.
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
    if (projectIds.length === 0) {
      return NextResponse.json({ projectIds, links });
    }

    const teamId = settings.clickup_team_id?.trim() ?? "";

    // Prefer first task list (by sort_order) so ClickUp opens with real content
    // instead of Folder Overview, which often stays blank after white-label refresh.
    const { data: listRows, error: listsErr } = await auth.admin
      .from("task_lists")
      .select("id, project_id, sort_order")
      .eq("organization_id", orgId)
      .in("project_id", projectIds)
      .order("sort_order", { ascending: true });
    if (listsErr) throw new Error(listsErr.message);

    const listIds = (listRows ?? []).map((r) => String(r.id));
    const listClickUpByReaper = new Map<string, string>();
    if (listIds.length > 0) {
      const { data: listLinks, error: listLinkErr } = await auth.admin
        .from("addon_clickup_links")
        .select("reaper_id, clickup_id")
        .eq("organization_id", orgId)
        .eq("entity_type", "task_list")
        .in("reaper_id", listIds);
      if (listLinkErr) throw new Error(listLinkErr.message);
      for (const row of listLinks ?? []) {
        const cuId = String(row.clickup_id ?? "").trim();
        if (cuId) listClickUpByReaper.set(String(row.reaper_id), cuId);
      }
    }

    const firstListHrefByProject = new Map<string, string>();
    for (const row of listRows ?? []) {
      const projectId = String(row.project_id);
      if (firstListHrefByProject.has(projectId)) continue;
      const cuListId = listClickUpByReaper.get(String(row.id));
      const href = clickUpListUrl(teamId, cuListId);
      if (href) firstListHrefByProject.set(projectId, href);
    }

    const { data: folderLinks, error: folderLinkErr } = await auth.admin
      .from("addon_clickup_links")
      .select("reaper_id, clickup_id")
      .eq("organization_id", orgId)
      .eq("entity_type", "project")
      .in("reaper_id", projectIds);
    if (folderLinkErr) throw new Error(folderLinkErr.message);

    for (const projectId of projectIds) {
      const listHref = firstListHrefByProject.get(projectId);
      if (listHref) {
        links[projectId] = listHref;
        continue;
      }
      const folderRow = (folderLinks ?? []).find(
        (r) => String(r.reaper_id) === projectId,
      );
      const folderHref = clickUpFolderUrl(
        teamId,
        folderRow ? String(folderRow.clickup_id ?? "").trim() : null,
      );
      if (folderHref) links[projectId] = folderHref;
    }

    return NextResponse.json({ projectIds, links });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
