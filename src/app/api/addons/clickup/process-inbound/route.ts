import { NextResponse } from "next/server";
import {
  healStaleSpaceWebhooks,
  processInbound,
} from "@/addons/clickup/inbound";
import { requireAuthApiAccess } from "@/lib/api/require-auth";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DEFAULT_PUBLIC_APP_ORIGIN } from "@/lib/security/request";

export const runtime = "nodejs";
export const maxDuration = 60;

function healOrigin(request: Request): string {
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

async function healAfterDrain(request: Request, admin: ReturnType<typeof createAdminClient>) {
  try {
    await healStaleSpaceWebhooks({
      admin,
      origin: healOrigin(request),
      maxChecks: 1,
    });
  } catch {
    /* drain succeeded; heal is best-effort (cooldown usually no-ops) */
  }
}

/**
 * Drain pending ClickUp inbound webhook events for the caller's org.
 * Also probes webhook health (6h cooldown) so Hobby's daily cron isn't the
 * only path that can recreate a suspended hook.
 */
export async function POST(request: Request) {
  try {
    const secret = request.headers.get("x-clickup-outbox-secret");
    const envSecret = process.env.CLICKUP_OUTBOX_SECRET?.trim();

    if (secret && envSecret && secret === envSecret) {
      if (!isSupabaseConfigured() || !isServiceRoleConfigured()) {
        return NextResponse.json({ error: "Not configured" }, { status: 400 });
      }
      const body = (await request.json().catch(() => ({}))) as {
        organization_id?: string;
      };
      if (!body.organization_id) {
        return NextResponse.json(
          { error: "organization_id required" },
          { status: 400 },
        );
      }
      const admin = createAdminClient();
      const result = await processInbound(admin, body.organization_id, 40);
      await healAfterDrain(request, admin);
      return NextResponse.json(result);
    }

    const auth = await requireAuthApiAccess(request);
    if ("error" in auth) return auth.error;
    const result = await processInbound(
      auth.admin,
      auth.caller.organization_id,
      40,
    );
    await healAfterDrain(request, auth.admin);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
