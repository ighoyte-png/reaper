import { NextResponse } from "next/server";
import { requireAuthApiAccess } from "@/lib/api/require-auth";
import { loadSettings } from "@/addons/clickup/db";

/**
 * Org-member readable list of project ids with ClickUp sync enabled.
 * Used for list/detail badges (not manager-only).
 */
export async function GET(request: Request) {
  try {
    const auth = await requireAuthApiAccess(request);
    if ("error" in auth) return auth.error;
    const orgId = auth.caller.organization_id;

    const settings = await loadSettings(auth.admin, orgId);
    if (!settings?.enabled) {
      return NextResponse.json({ projectIds: [] as string[] });
    }

    const { data, error } = await auth.admin
      .from("addon_clickup_project_sync")
      .select("project_id")
      .eq("organization_id", orgId)
      .eq("enabled", true);
    if (error) throw new Error(error.message);

    return NextResponse.json({
      projectIds: (data ?? []).map((r) => String(r.project_id)),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
