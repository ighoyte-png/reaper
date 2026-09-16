import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  exchangeOAuthCode,
  getAuthorizedTeams,
  getAuthorizedUser,
} from "@/addons/clickup/client";
import {
  loadSettings,
  resolveOAuthAppCredentials,
  upsertOAuthToken,
  upsertSettings,
} from "@/addons/clickup/db";
import {
  verifyOAuthState,
} from "@/addons/clickup/oauth-state";
import { originFromRequest } from "@/lib/security/request";

function settingsRedirect(
  origin: string,
  workspaceSlug: string,
  tab: "integrations",
  params: Record<string, string>,
) {
  const path = workspaceSlug
    ? `/${encodeURIComponent(workspaceSlug)}/settings`
    : "/settings";
  const u = new URL(`${origin}${path}`);
  u.searchParams.set("tab", tab);
  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(k, v);
  }
  return NextResponse.redirect(u);
}

/** ClickUp OAuth callback — exchange code, persist token, redirect to Settings. */
export async function GET(request: Request) {
  const origin =
    originFromRequest(request) ||
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    new URL(request.url).origin;

  let workspaceSlug = "";

  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const err = url.searchParams.get("error");

    if (err) {
      return settingsRedirect(origin, workspaceSlug, "integrations", {
        clickup: "error",
        message: err,
      });
    }
    if (!code || !state) {
      return settingsRedirect(origin, workspaceSlug, "integrations", {
        clickup: "error",
        message: "missing_code",
      });
    }

    const admin = createAdminClient();
    let payload;
    try {
      payload = verifyOAuthState(state);
      workspaceSlug = payload.workspaceSlug || "";
    } catch {
      return settingsRedirect(origin, workspaceSlug, "integrations", {
        clickup: "error",
        message: "invalid_state",
      });
    }

    if (!workspaceSlug) {
      const { data: org } = await admin
        .from("organizations")
        .select("slug")
        .eq("id", payload.orgId)
        .maybeSingle();
      workspaceSlug = org?.slug ?? "";
    }

    const settings = await loadSettings(admin, payload.orgId);
    const creds = resolveOAuthAppCredentials(settings);
    if (!creds) {
      return settingsRedirect(origin, workspaceSlug, "integrations", {
        clickup: "error",
        message: "oauth_app_missing",
      });
    }

    const { access_token } = await exchangeOAuthCode({
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      code,
    });

    const oauthAuth = { token: access_token, type: "oauth" as const };
    const user = await getAuthorizedUser(oauthAuth);
    const teams = await getAuthorizedTeams(oauthAuth);

    await upsertOAuthToken(admin, {
      organization_id: payload.orgId,
      profile_id: payload.profileId,
      clickup_user_id: String(user.id),
      access_token,
      authorized_team_ids: teams.map((t) => t.id),
      needs_reauth: false,
    });

    const { data: person } = await admin
      .from("people")
      .select("id")
      .eq("organization_id", payload.orgId)
      .eq("profile_id", payload.profileId)
      .maybeSingle();
    if (person?.id) {
      await admin.from("addon_clickup_user_map").upsert({
        organization_id: payload.orgId,
        person_id: person.id,
        clickup_user_id: String(user.id),
        updated_at: new Date().toISOString(),
      });
    }

    if (payload.purpose === "service") {
      await upsertSettings(admin, payload.orgId, {
        service_profile_id: payload.profileId,
        last_error: null,
      });
      return settingsRedirect(origin, workspaceSlug, "integrations", {
        clickup: "service_connected",
      });
    }

    return settingsRedirect(origin, workspaceSlug, "integrations", {
      clickup: "connected",
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message.slice(0, 120) : "oauth_failed";
    return settingsRedirect(origin, workspaceSlug, "integrations", {
      clickup: "error",
      message,
    });
  }
}
