import { NextResponse } from "next/server";
import { processOutbox } from "@/addons/clickup/sync";
import { processInbound } from "@/addons/clickup/inbound";
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

/**
 * Vercel Cron safety net: drain pending ClickUp outbox + inbound for orgs
 * that have queued work. Event-driven drains handle the hot path; this runs
 * every 2 minutes for misses/failures.
 */
async function drainAll() {
  if (!isSupabaseConfigured() || !isServiceRoleConfigured()) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const admin = createAdminClient();
  const orgIds = new Set<string>();

  const [{ data: outboxOrgs }, { data: inboundOrgs }, { data: enabledOrgs }] =
    await Promise.all([
      admin.from("addon_clickup_outbox").select("organization_id").limit(200),
      admin
        .from("addon_clickup_inbound_events")
        .select("organization_id")
        .eq("status", "pending")
        .limit(200),
      admin
        .from("addon_clickup_settings")
        .select("organization_id")
        .eq("enabled", true)
        .limit(100),
    ]);

  for (const row of outboxOrgs ?? []) {
    if (row.organization_id) orgIds.add(String(row.organization_id));
  }
  for (const row of inboundOrgs ?? []) {
    if (row.organization_id) orgIds.add(String(row.organization_id));
  }
  // Always tick enabled orgs so due/retry rows (available_at) get a chance
  // even when the select above races with locks.
  for (const row of enabledOrgs ?? []) {
    if (row.organization_id) orgIds.add(String(row.organization_id));
  }

  const results: {
    organization_id: string;
    outbox: { processed: number; errors: number };
    inbound: { processed: number; ignored: number; errors: number };
  }[] = [];

  for (const orgId of orgIds) {
    const outbox = await processOutbox(admin, orgId, 40);
    const inbound = await processInbound(admin, orgId, 40);
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

  return NextResponse.json({
    ok: true,
    orgs: results.length,
    results,
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
