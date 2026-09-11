import { NextResponse } from "next/server";
import { requireClickUpManagerApi } from "@/addons/clickup/api-auth";
import { processOutbox } from "@/addons/clickup/sync";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Process pending ClickUp outbox rows.
 * Auth: signed-in manager for their org, OR shared secret header for webhooks.
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
      const result = await processOutbox(admin, body.organization_id, 40);
      return NextResponse.json(result);
    }

    const auth = await requireClickUpManagerApi(request);
    if ("error" in auth) return auth.error;
    const result = await processOutbox(
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
