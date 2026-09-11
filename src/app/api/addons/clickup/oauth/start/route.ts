import { NextResponse } from "next/server";
import { requireAuthApiAccess } from "@/lib/api/require-auth";
import {
  loadSettings,
  resolveOAuthAppCredentials,
} from "@/addons/clickup/db";
import {
  clickUpAuthorizeUrl,
  oauthRedirectUri,
  signOAuthState,
} from "@/addons/clickup/oauth-state";
import { originFromRequest } from "@/lib/security/request";

/**
 * Start ClickUp OAuth. Query: purpose=user|service
 * Redirects browser to ClickUp authorize URL.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireAuthApiAccess(request);
    if ("error" in auth) return auth.error;

    const url = new URL(request.url);
    const purposeRaw = url.searchParams.get("purpose") ?? "user";
    const purpose = purposeRaw === "service" ? "service" : "user";

    if (purpose === "service" && auth.caller.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can connect the ClickUp service account" },
        { status: 403 },
      );
    }

    const settings = await loadSettings(
      auth.admin,
      auth.caller.organization_id,
    );
    const creds = resolveOAuthAppCredentials(settings);
    if (!creds) {
      return NextResponse.json(
        {
          error:
            "ClickUp OAuth app is not configured. Ask an admin to add client id/secret under Admin → Addons · ClickUp.",
        },
        { status: 400 },
      );
    }

    const { data: org } = await auth.admin
      .from("organizations")
      .select("slug")
      .eq("id", auth.caller.organization_id)
      .maybeSingle();

    const origin =
      originFromRequest(request) ||
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
      new URL(request.url).origin;
    const redirectUri = oauthRedirectUri(origin);
    const state = signOAuthState({
      orgId: auth.caller.organization_id,
      profileId: auth.caller.id,
      purpose,
      workspaceSlug: org?.slug ?? "",
    });

    const authorize = clickUpAuthorizeUrl({
      clientId: creds.clientId,
      redirectUri,
      state,
    });
    return NextResponse.redirect(authorize);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
