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
/** Inline drain + after() backlog; keep under ClickUp's ~7s fail window. */
export const maxDuration = 60;

function siteOrigin(request: Request): string | null {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) {
    try {
      return new URL(fromEnv).origin;
    } catch {
      return fromEnv.replace(/\/$/, "") || null;
    }
  }
  try {
    return new URL(request.url).origin;
  } catch {
    return null;
  }
}

/** Kick a separate function invocation so drain can outlive this response. */
function kickInboundDrain(request: Request, orgId: string) {
  const secret = process.env.CLICKUP_OUTBOX_SECRET?.trim();
  const origin = siteOrigin(request);
  if (!secret || !origin) return;
  const url = `${origin}/api/addons/clickup/process-inbound`;
  after(() => {
    void fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-clickup-outbox-secret": secret,
      },
      body: JSON.stringify({ organization_id: orgId }),
    }).catch(() => {
      /* daily cron / next webhook will retry */
    });
  });
}

/**
 * ClickUp Space webhook receiver.
 * Verifies HMAC, enqueues, applies a tiny inline batch (so Hobby doesn't drop
 * work), ACKs ClickUp quickly, then kicks a separate drain for any backlog.
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

    // Apply the just-enqueued event in-process. after()-only drains were
    // getting dropped on Hobby, leaving creates stuck in pending forever.
    await processInbound(admin, orgId, 2);

    // Separate invocation for any remaining backlog (does not block ClickUp).
    kickInboundDrain(request, orgId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
