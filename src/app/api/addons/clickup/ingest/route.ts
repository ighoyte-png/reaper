import { NextResponse } from "next/server";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { processOutbox } from "@/addons/clickup/sync";

/**
 * Supabase Database Webhook / external ingest.
 * Prefer writing to outbox via triggers; this endpoint drains the outbox.
 * Header: x-clickup-outbox-secret must match CLICKUP_OUTBOX_SECRET when set;
 * if unset in development, requires organization_id in body with service role.
 */
export async function POST(request: Request) {
  try {
    if (!isSupabaseConfigured() || !isServiceRoleConfigured()) {
      return NextResponse.json({ error: "Not configured" }, { status: 400 });
    }
    const envSecret = process.env.CLICKUP_OUTBOX_SECRET?.trim();
    const secret = request.headers.get("x-clickup-outbox-secret");
    if (envSecret && secret !== envSecret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      organization_id?: string;
      record?: { organization_id?: string };
      type?: string;
    };
    const orgId =
      body.organization_id ??
      body.record?.organization_id ??
      null;
    if (!orgId) {
      // Webhook may fire per-row without us needing to re-enqueue — drain all
      // orgs with pending work is expensive; require org id.
      return NextResponse.json({ ok: true, skipped: "no org" });
    }

    const admin = createAdminClient();
    const result = await processOutbox(admin, orgId, 50);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
