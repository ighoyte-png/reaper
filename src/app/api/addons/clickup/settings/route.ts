import { NextResponse } from "next/server";
import {
  requireClickUpAdminApi,
  requireClickUpManagerApi,
} from "@/addons/clickup/api-auth";
import {
  hasOAuthToken,
  loadSettings,
  upsertSettings,
} from "@/addons/clickup/db";
import {
  emptyStatusMap,
  normalizeStatusMap,
  toPublicSettings,
} from "@/addons/clickup/types";
import { oauthRedirectUri } from "@/addons/clickup/oauth-state";
import { originFromRequest } from "@/lib/security/request";

function emptyPublic(orgId: string, oauthRedirect: string | null) {
  return {
    organization_id: orgId,
    enabled: false,
    has_token: false,
    token_masked: null,
    has_oauth_app: false,
    oauth_client_id_masked: null,
    has_service_connection: false,
    service_profile_id: null,
    clickup_team_id: null,
    space_id: null,
    space_name: null,
    status_map: emptyStatusMap(),
    last_error: null,
    last_synced_at: null,
    oauth_redirect_uri: oauthRedirect,
  };
}

async function publicFor(
  admin: Parameters<typeof loadSettings>[0],
  orgId: string,
  request: Request,
) {
  const origin =
    originFromRequest(request) ||
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    new URL(request.url).origin;
  const redirect = oauthRedirectUri(origin);
  const row = await loadSettings(admin, orgId);
  if (!row) return emptyPublic(orgId, redirect);
  const hasService = await hasOAuthToken(
    admin,
    orgId,
    row.service_profile_id,
  );
  const publicSettings = toPublicSettings(row, {
    hasServiceConnection: hasService,
    oauthRedirectUri: redirect,
  });
  const envApp = Boolean(
    process.env.CLICKUP_OAUTH_CLIENT_ID?.trim() &&
      process.env.CLICKUP_OAUTH_CLIENT_SECRET?.trim(),
  );
  if (envApp) {
    publicSettings.has_oauth_app = true;
  }
  return publicSettings;
}

export async function GET(request: Request) {
  try {
    const auth = await requireClickUpManagerApi(request);
    if ("error" in auth) return auth.error;
    const settings = await publicFor(
      auth.admin,
      auth.caller.organization_id,
      request,
    );
    return NextResponse.json({ settings });
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
      enabled?: boolean;
      personal_api_token?: string | null;
      clear_token?: boolean;
      oauth_client_id?: string | null;
      oauth_client_secret?: string | null;
      clear_oauth_secret?: boolean;
      clear_service_connection?: boolean;
      clickup_team_id?: string | null;
      space_id?: string | null;
      space_name?: string | null;
      status_map?: Record<string, string>;
    };

    const status_map = normalizeStatusMap(body.status_map ?? {});
    const existing = await loadSettings(
      auth.admin,
      auth.caller.organization_id,
    );

    if (body.enabled) {
      const hasOAuthApp = Boolean(
        (body.oauth_client_id?.trim() || existing?.oauth_client_id?.trim()) &&
          (body.oauth_client_secret?.trim() ||
            existing?.oauth_client_secret?.trim() ||
            (process.env.CLICKUP_OAUTH_CLIENT_ID?.trim() &&
              process.env.CLICKUP_OAUTH_CLIENT_SECRET?.trim())),
      );
      const hasService = await hasOAuthToken(
        auth.admin,
        auth.caller.organization_id,
        body.clear_service_connection
          ? null
          : (existing?.service_profile_id ?? null),
      );
      const hasLegacyPat = Boolean(
        body.clear_token
          ? false
          : body.personal_api_token?.trim() || existing?.personal_api_token,
      );
      if (!hasService && !hasLegacyPat) {
        return NextResponse.json(
          {
            error:
              "Connect a ClickUp service account (OAuth) — or paste a legacy PAT — before enabling",
          },
          { status: 400 },
        );
      }
      if (
        !hasOAuthApp &&
        !process.env.CLICKUP_OAUTH_CLIENT_ID?.trim() &&
        !hasLegacyPat
      ) {
        return NextResponse.json(
          { error: "Configure the ClickUp OAuth app client id and secret" },
          { status: 400 },
        );
      }
      if (!body.space_id && !existing?.space_id) {
        return NextResponse.json(
          { error: "Select or create a ClickUp Space before enabling" },
          { status: 400 },
        );
      }
      if (!status_map.upcoming || !status_map.active || !status_map.complete) {
        return NextResponse.json(
          { error: "Map all three Reaper statuses before enabling" },
          { status: 400 },
        );
      }
    }

    await upsertSettings(auth.admin, auth.caller.organization_id, {
      enabled: body.enabled,
      personal_api_token: body.clear_token
        ? null
        : body.personal_api_token !== undefined
          ? body.personal_api_token?.trim() || null
          : undefined,
      oauth_client_id:
        body.oauth_client_id !== undefined
          ? body.oauth_client_id?.trim() || null
          : undefined,
      oauth_client_secret: body.clear_oauth_secret
        ? null
        : body.oauth_client_secret !== undefined
          ? body.oauth_client_secret?.trim() || null
          : undefined,
      service_profile_id: body.clear_service_connection
        ? null
        : undefined,
      clickup_team_id: body.clickup_team_id,
      space_id: body.space_id,
      space_name: body.space_name,
      status_map,
      last_error: null,
    });

    const settings = await publicFor(
      auth.admin,
      auth.caller.organization_id,
      request,
    );
    return NextResponse.json({ settings });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
