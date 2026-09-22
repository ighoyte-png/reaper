import { after, NextResponse } from "next/server";
import {
  enqueueInboundFromWebhook,
  processInbound,
  verifyClickUpWebhookSignature,
  type ClickUpWebhookPayload,
} from "@/addons/clickup/inbound";
import { loadSettingsByWebhookId } from "@/addons/clickup/db";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const runtime = "nodejs";
/** after() drain may continue briefly past the response. */
export const maxDuration = 60;

/**
 * ClickUp Space webhook receiver.
 * Verifies HMAC, enqueues idempotent inbound events, ACKs quickly, then drains
 * via after(). ClickUp marks webhooks failing when the response takes >7s and
 * suspends at fail_count 100 — never do heavy work before responding.
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
      // 404 (not 401): ClickUp suspends immediately on 401.
      return NextResponse.json({ error: "Unknown webhook" }, { status: 404 });
    }

    if (
      !verifyClickUpWebhookSignature(
        rawBody,
        signature,
        settings.webhook_secret,
      )
    ) {
      // 400 (not 401): invalid HMAC must not auto-suspend the webhook.
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    if (!settings.enabled) {
      return NextResponse.json({ ok: true, skipped: "addon_disabled" });
    }

    const orgId = settings.organization_id;

    await enqueueInboundFromWebhook({
      admin,
      orgId,
      payload,
    });

    // Drain after ACK so ClickUp never waits on processInbound (>7s → failing).
    // Small batch keeps after()-CPU low; the next event or daily cron finishes backlog.
    after(() => {
      void processInbound(admin, orgId, 10).catch(() => {
        /* cron / next webhook will retry */
      });
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
