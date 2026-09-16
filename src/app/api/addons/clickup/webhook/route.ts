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

/**
 * ClickUp Space webhook receiver.
 * Verifies HMAC, enqueues idempotent inbound events, then drains the queue.
 * Drain must complete in-process — there is no client poller anymore, and
 * fire-and-forget work is dropped when the serverless function returns.
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

    const orgId = settings.organization_id;

    await enqueueInboundFromWebhook({
      admin,
      orgId,
      payload,
    });

    // Apply the just-enqueued event (and a small backlog) before responding.
    await processInbound(admin, orgId, 40);

    // Continue draining any remaining pending rows after the response.
    after(() => {
      void processInbound(admin, orgId, 40).catch(() => {
        /* next webhook / manual drain will retry */
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
