import { NextResponse } from "next/server";
import { requireClickUpAdminApi } from "@/addons/clickup/api-auth";
import { resolveOrgClickUpAuth } from "@/addons/clickup/auth";
import { loadSettings } from "@/addons/clickup/db";
import { getTeamMembers } from "@/addons/clickup/client";

export async function GET(request: Request) {
  try {
    const auth = await requireClickUpAdminApi(request);
    if ("error" in auth) return auth.error;
    const settings = await loadSettings(
      auth.admin,
      auth.caller.organization_id,
    );
    if (!settings?.clickup_team_id) {
      return NextResponse.json({ members: [], maps: [] });
    }
    const cuAuth = await resolveOrgClickUpAuth(
      auth.admin,
      auth.caller.organization_id,
    );
    const members = await getTeamMembers(cuAuth, settings.clickup_team_id);
    const { data: maps } = await auth.admin
      .from("addon_clickup_user_map")
      .select("person_id, clickup_user_id")
      .eq("organization_id", auth.caller.organization_id);
    return NextResponse.json({
      members: members.map((m) => ({
        id: String(m.id),
        email: m.email ?? null,
        username: m.username ?? null,
      })),
      maps: maps ?? [],
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireClickUpAdminApi(request);
    if ("error" in auth) return auth.error;
    const body = (await request.json()) as {
      person_id?: string;
      clickup_user_id?: string | null;
    };
    if (!body.person_id) {
      return NextResponse.json({ error: "person_id required" }, { status: 400 });
    }
    if (!body.clickup_user_id) {
      await auth.admin
        .from("addon_clickup_user_map")
        .delete()
        .eq("organization_id", auth.caller.organization_id)
        .eq("person_id", body.person_id);
    } else {
      await auth.admin.from("addon_clickup_user_map").upsert({
        organization_id: auth.caller.organization_id,
        person_id: body.person_id,
        clickup_user_id: String(body.clickup_user_id),
        updated_at: new Date().toISOString(),
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
