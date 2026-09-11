import { NextResponse } from "next/server";
import { requireAuthApiAccess } from "@/lib/api/require-auth";
import {
  deleteOAuthToken,
  hasOAuthToken,
  loadOAuthToken,
  loadSettings,
  upsertSettings,
} from "@/addons/clickup/db";
import type { AddonClickupOAuthConnectionPublic } from "@/addons/clickup/types";

/** Current user's ClickUp OAuth connection status (no token returned). */
export async function GET(request: Request) {
  try {
    const auth = await requireAuthApiAccess(request);
    if ("error" in auth) return auth.error;

    const settings = await loadSettings(
      auth.admin,
      auth.caller.organization_id,
    );
    const row = await loadOAuthToken(
      auth.admin,
      auth.caller.organization_id,
      auth.caller.id,
    );

    const connection: AddonClickupOAuthConnectionPublic = {
      connected: Boolean(row?.access_token && !row.needs_reauth),
      clickup_user_id: row?.clickup_user_id ?? null,
      needs_reauth: Boolean(row?.needs_reauth),
      connected_at: row?.connected_at ?? null,
      is_service_account: settings?.service_profile_id === auth.caller.id,
    };

    return NextResponse.json({
      connection,
      addon_enabled: Boolean(settings?.enabled),
      has_oauth_app: Boolean(
        (process.env.CLICKUP_OAUTH_CLIENT_ID?.trim() &&
          process.env.CLICKUP_OAUTH_CLIENT_SECRET?.trim()) ||
          (settings?.oauth_client_id?.trim() &&
            settings?.oauth_client_secret?.trim()),
      ),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}

/** Disconnect current user's ClickUp OAuth. */
export async function DELETE(request: Request) {
  try {
    const auth = await requireAuthApiAccess(request);
    if ("error" in auth) return auth.error;

    const settings = await loadSettings(
      auth.admin,
      auth.caller.organization_id,
    );
    await deleteOAuthToken(
      auth.admin,
      auth.caller.organization_id,
      auth.caller.id,
    );

    if (settings?.service_profile_id === auth.caller.id) {
      await upsertSettings(auth.admin, auth.caller.organization_id, {
        service_profile_id: null,
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

/** Designate current connection as org service account (admin only). */
export async function POST(request: Request) {
  try {
    const auth = await requireAuthApiAccess(request);
    if ("error" in auth) return auth.error;
    if (auth.caller.role !== "admin") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
    };
    if (body.action === "use_as_service") {
      const ok = await hasOAuthToken(
        auth.admin,
        auth.caller.organization_id,
        auth.caller.id,
      );
      if (!ok) {
        return NextResponse.json(
          { error: "Connect ClickUp first" },
          { status: 400 },
        );
      }
      await upsertSettings(auth.admin, auth.caller.organization_id, {
        service_profile_id: auth.caller.id,
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
