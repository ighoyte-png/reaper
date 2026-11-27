import { NextResponse } from "next/server";
import { requireClickUpAdminApi } from "@/addons/clickup/api-auth";
import {
  forceHealOrgWebhook,
  getOrgClickUpSyncHealth,
} from "@/addons/clickup/health";
import { processInbound } from "@/addons/clickup/inbound";
import { assertAllowedSiteOrigin } from "@/lib/security/request";
import { clientSiteOrigin } from "@/lib/share/token";

function requestOrigin(request: Request): string {
  const check = assertAllowedSiteOrigin(request);
  if (check.ok) return check.origin;
  return clientSiteOrigin();
}

/** Live ClickUp sync health for the active workspace (admins). */
export async function GET(request: Request) {
  try {
    const auth = await requireClickUpAdminApi(request);
    if ("error" in auth) return auth.error;
    const health = await getOrgClickUpSyncHealth({
      admin: auth.admin,
      orgId: auth.caller.organization_id,
      origin: requestOrigin(request),
    });
    return NextResponse.json({ health });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}

/**
 * Body: { action: "heal" | "drain" }
 * heal — recreate Space webhook (clears suspended fail_count=100)
 * drain — process pending inbound queue now
 */
export async function POST(request: Request) {
  try {
    const auth = await requireClickUpAdminApi(request);
    if ("error" in auth) return auth.error;
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
    };
    const action = body.action === "drain" ? "drain" : "heal";
    const orgId = auth.caller.organization_id;
    const origin = requestOrigin(request);

    if (action === "drain") {
      const result = await processInbound(auth.admin, orgId, 40);
      const health = await getOrgClickUpSyncHealth({
        admin: auth.admin,
        orgId,
        origin,
      });
      return NextResponse.json({
        ok: true,
        action: "drain",
        processed: result.processed,
        ignored: result.ignored,
        errors: result.errors.slice(0, 5),
        health,
      });
    }

    const healed = await forceHealOrgWebhook({
      admin: auth.admin,
      orgId,
      origin,
    });
    return NextResponse.json({
      ok: true,
      action: healed.action,
      webhookId: healed.webhookId,
      health: healed.health,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 400 },
    );
  }
}
