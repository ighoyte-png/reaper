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
import { DEFAULT_PUBLIC_APP_ORIGIN } from "@/lib/security/request";

export const runtime = "nodejs";
/** Kick drain may run after ACK; keep headroom for that invocation. */
export const maxDuration = 60;

/** Hard cap for best-effort inline apply — ClickUp fails deliveries around ~7s. */
const INLINE_APPLY_BUDGET_MS = 1500;

/**
 * Origin for the follow-up drain kick.
 * Prefer the live request host (what ClickUp just hit). Ignore *.vercel.app
 * SITE_URL so we never kick a dead preview deployment.
 */
function drainOrigin(request: Request): string {
  try {
    const fromReq = new URL(request.url).origin;
    const host = new URL(fromReq).hostname.toLowerCase();
    if (host && !host.endsWith(".vercel.app")) return fromReq;
  } catch {
    /* fall through */
  }
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) {
    try {
      const origin = new URL(fromEnv).origin;
      const host = new URL(origin).hostname.toLowerCase();
      if (!host.endsWith(".vercel.app")) return origin;
    } catch {
      /* fall through */
    }
  }
  return DEFAULT_PUBLIC_APP_ORIGIN;
}

/** Kick a separate function invocation so drain can outlive this response. */
function kickInboundDrain(request: Request, orgId: string) {
  const secret = process.env.CLICKUP_OUTBOX_SECRET?.trim();
  if (!secret) return;
  const url = `${drainOrigin(request)}/api/addons/clickup/process-inbound`;
  const headers = {
    "content-type": "application/json",
    "x-clickup-outbox-secret": secret,
  };
  const body = JSON.stringify({ organization_id: orgId });
  // Fire immediately (don't rely solely on after() — Hobby drops it often),
  // and also schedule after() as a second chance once the response is sent.
  void fetch(url, { method: "POST", headers, body }).catch(() => {});
  after(() => {
    void fetch(url, { method: "POST", headers, body }).catch(() => {});
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * ClickUp Space webhook receiver.
 * Verify → enqueue → kick drain → best-effort tiny apply (≤1.5s) → ACK fast.
 * Never block ClickUp on full inbound processing (that caused fail_count→100).
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

    // Start the real drain in a separate invocation before any inline work.
    kickInboundDrain(request, orgId);

    // Hobby safety net: try one event briefly. Never let this blow ClickUp's
    // ~7s window or turn into a 500 after the event is already stored.
    try {
      await Promise.race([
        processInbound(admin, orgId, 1).catch(() => null),
        sleep(INLINE_APPLY_BUDGET_MS),
      ]);
    } catch {
      /* kick / cron will retry */
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
