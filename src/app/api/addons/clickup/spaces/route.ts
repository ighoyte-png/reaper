import { NextResponse } from "next/server";
import { requireClickUpAdminApi } from "@/addons/clickup/api-auth";
import { resolveOrgClickUpAuth } from "@/addons/clickup/auth";
import {
  createSpace,
  getAuthorizedTeams,
  getSpaces,
} from "@/addons/clickup/client";
import type { ClickUpAuth } from "@/addons/clickup/types";

async function authForOrg(
  admin: Parameters<typeof resolveOrgClickUpAuth>[0],
  orgId: string,
  bodyToken?: string | null,
): Promise<ClickUpAuth> {
  if (bodyToken?.trim()) {
    return { token: bodyToken.trim(), type: "pat" };
  }
  return resolveOrgClickUpAuth(admin, orgId);
}

/** List workspaces (teams) and spaces for the service/OAuth token. */
export async function GET(request: Request) {
  try {
    const auth = await requireClickUpAdminApi(request);
    if ("error" in auth) return auth.error;
    const url = new URL(request.url);
    const teamId = url.searchParams.get("teamId");
    const cuAuth = await authForOrg(auth.admin, auth.caller.organization_id);

    if (!teamId) {
      const teams = await getAuthorizedTeams(cuAuth);
      return NextResponse.json({ teams });
    }
    const spaces = await getSpaces(cuAuth, teamId);
    return NextResponse.json({
      spaces: spaces.map((s) => ({
        id: s.id,
        name: s.name,
        statuses: (s.statuses ?? []).map((x) => x.status),
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}

/** Create a new Space in a team. */
export async function POST(request: Request) {
  try {
    const auth = await requireClickUpAdminApi(request);
    if ("error" in auth) return auth.error;
    const body = (await request.json()) as {
      teamId?: string;
      name?: string;
      personal_api_token?: string;
    };
    if (!body.teamId?.trim() || !body.name?.trim()) {
      return NextResponse.json(
        { error: "teamId and name are required" },
        { status: 400 },
      );
    }
    const cuAuth = await authForOrg(
      auth.admin,
      auth.caller.organization_id,
      body.personal_api_token,
    );
    const space = await createSpace(
      cuAuth,
      body.teamId.trim(),
      body.name.trim(),
    );
    return NextResponse.json({
      space: {
        id: space.id,
        name: space.name,
        statuses: (space.statuses ?? []).map((x) => x.status),
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
