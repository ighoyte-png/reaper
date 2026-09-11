import { NextResponse } from "next/server";
import { requireClickUpManagerApi } from "@/addons/clickup/api-auth";
import { resolveOrgClickUpAuth } from "@/addons/clickup/auth";
import { loadSettings } from "@/addons/clickup/db";
import { getFolders } from "@/addons/clickup/client";

/** List folders in the configured Space (for project Link dropdown). */
export async function GET(request: Request) {
  try {
    const auth = await requireClickUpManagerApi(request);
    if ("error" in auth) return auth.error;

    const settings = await loadSettings(
      auth.admin,
      auth.caller.organization_id,
    );
    if (!settings?.space_id) {
      return NextResponse.json(
        { error: "ClickUp Space is not configured" },
        { status: 400 },
      );
    }
    const cuAuth = await resolveOrgClickUpAuth(
      auth.admin,
      auth.caller.organization_id,
    );
    const folders = await getFolders(cuAuth, settings.space_id);
    return NextResponse.json({
      folders: folders.map((f) => ({ id: f.id, name: f.name })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
