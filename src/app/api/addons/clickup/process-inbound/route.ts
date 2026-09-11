import { NextResponse } from "next/server";
import { processInbound } from "@/addons/clickup/inbound";
import { requireAuthApiAccess } from "@/lib/api/require-auth";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Drain pending ClickUp inbound webhook events for the caller's org.
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
      return NextResponse.json(result);
    }

    const auth = await requireAuthApiAccess(request);
    if ("error" in auth) return auth.error;
    const result = await processInbound(
      auth.admin,
      auth.caller.organization_id,
      40,
    );
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
