import { NextResponse } from "next/server";
import {
  enqueueInboundFromWebhook,
  processInbound,
  verifyClickUpWebhookSignature,
  type ClickUpWebhookPayload,
} from "@/addons/clickup/inbound";
import { loadSettingsByWebhookId } from "@/addons/clickup/db";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * ClickUp Space webhook receiver.
 * Verifies HMAC, enqueues idempotent inbound events, returns quickly.
 */
export async function POST(request: Request) {
  try {
    if (!isSupabaseConfigured() || !isServiceRoleConfigured()) {
      return NextResponse.json({ error: "Not configured" }, { status: 503 });
    }

    const rawBody = await request.text();
    const signature = request.headers.get("x-signature");

    let payload: ClickUpWebhookPayload;
    try {
      payload = JSON.parse(rawBody) as ClickUpWebhookPayload;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const webhookId = payload.webhook_id?.trim();
    if (!webhookId) {
      return NextResponse.json({ error: "Missing webhook_id" }, { status: 400 });
    }

    const admin = createAdminClient();
    const settings = await loadSettingsByWebhookId(admin, webhookId);
    if (!settings?.webhook_enabled || !settings.webhook_secret) {
      return NextResponse.json({ error: "Unknown webhook" }, { status: 404 });
    }

    if (
      !verifyClickUpWebhookSignature(
        rawBody,
        signature,
        settings.webhook_secret,
      )
    ) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    if (!settings.enabled) {
      return NextResponse.json({ ok: true, skipped: "addon_disabled" });
    }

    await enqueueInboundFromWebhook({
      admin,
      orgId: settings.organization_id,
      payload,
    });

    // Best-effort drain so edits appear without waiting for the client poller.
    void processInbound(admin, settings.organization_id, 10).catch(() => {
      /* poller will retry */
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
