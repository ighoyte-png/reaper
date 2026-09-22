import { NextResponse } from "next/server";
import { processOutbox } from "@/addons/clickup/sync";
import {
  healStaleSpaceWebhooks,
  processInbound,
} from "@/addons/clickup/inbound";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const runtime = "nodejs";
/** Cron may drain several orgs; allow a bit of headroom. */
export const maxDuration = 60;

function authorize(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const outboxSecret = process.env.CLICKUP_OUTBOX_SECRET?.trim();
  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const headerSecret = request.headers.get("x-clickup-outbox-secret")?.trim();

  if (cronSecret && bearer === cronSecret) return true;
  if (outboxSecret && (headerSecret === outboxSecret || bearer === outboxSecret)) {
    return true;
  }
  // Local/dev convenience when neither secret is configured.
  if (!cronSecret && !outboxSecret && process.env.NODE_ENV !== "production") {
    return true;
  }
  return false;
}

function siteOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/$/, "") || null;
  }
}

/**
 * Daily Hobby safety net (event-driven paths do the real work).
 * Only drains orgs that already have pending rows — never wakes idle orgs.
 * Also probes at most one webhook (heal cooldown 6h).
 */
async function drainAll() {
  if (!isSupabaseConfigured() || !isServiceRoleConfigured()) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const admin = createAdminClient();
  const orgIds = new Set<string>();

  // Pending work only — skip the blanket "all enabled orgs" scan to save CPU.
  const [{ data: outboxOrgs }, { data: inboundOrgs }] = await Promise.all([
    admin.from("addon_clickup_outbox").select("organization_id").limit(50),
    admin
      .from("addon_clickup_inbound_events")
      .select("organization_id")
      .eq("status", "pending")
      .limit(50),
  ]);

  for (const row of outboxOrgs ?? []) {
    if (row.organization_id) orgIds.add(String(row.organization_id));
  }
  for (const row of inboundOrgs ?? []) {
    if (row.organization_id) orgIds.add(String(row.organization_id));
  }

  const results: {
    organization_id: string;
    outbox: { processed: number; errors: number };
    inbound: { processed: number; ignored: number; errors: number };
  }[] = [];

  // Small batches: hot path is webhook after() / browser outbox drain.
  for (const orgId of orgIds) {
    const outbox = await processOutbox(admin, orgId, 15);
    const inbound = await processInbound(admin, orgId, 15);
    results.push({
      organization_id: orgId,
      outbox: {
        processed: outbox.processed,
        errors: outbox.errors.length,
      },
      inbound: {
        processed: inbound.processed,
        ignored: inbound.ignored,
        errors: inbound.errors.length,
      },
    });
  }

  let webhookHeal: {
    checked: number;
    recreated: number;
    reactivated: number;
    errors: string[];
    skipped?: string;
  } = { checked: 0, recreated: 0, reactivated: 0, errors: [] };
  const origin = siteOrigin();
  if (origin) {
    try {
      webhookHeal = await healStaleSpaceWebhooks({
        admin,
        origin,
        maxChecks: 1,
      });
    } catch (e) {
      // Don't fail the queue drain if migration 119 isn't applied yet, etc.
      webhookHeal = {
        checked: 0,
        recreated: 0,
        reactivated: 0,
        errors: [e instanceof Error ? e.message : String(e)],
      };
    }
  } else {
    webhookHeal = {
      checked: 0,
      recreated: 0,
      reactivated: 0,
      errors: [],
      skipped: "NEXT_PUBLIC_SITE_URL unset",
    };
  }

  return NextResponse.json({
    ok: true,
    orgs: results.length,
    results,
    webhook_heal: webhookHeal,
  });
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    return await drainAll();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
