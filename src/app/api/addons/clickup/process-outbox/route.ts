import { NextResponse, after } from "next/server";
import { requireAuthApiAccess } from "@/lib/api/require-auth";
import { processOutbox } from "@/addons/clickup/sync";
import { healStaleSpaceWebhooks } from "@/addons/clickup/inbound";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";

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

/**
 * Process pending ClickUp outbox rows.
 * Auth: any signed-in org member for their org, OR shared secret header.
 * Also piggybacks a cheap webhook health check (cooldown 6h) so outbound
 * activity keeps inbound webhooks alive even if cron is delayed.
 */
export async function POST(request: Request) {
  try {
    const secret = request.headers.get("x-clickup-outbox-secret");
    const envSecret = process.env.CLICKUP_OUTBOX_SECRET?.trim();
    const origin = siteOrigin(request);

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
      if (origin) {
        after(() => {
          void healStaleSpaceWebhooks({ admin, origin, maxChecks: 1 }).catch(
            () => {
              /* cron will retry */
            },
          );
        });
      }
      return NextResponse.json(result);
    }

    const auth = await requireAuthApiAccess(request);
    if ("error" in auth) return auth.error;
    const result = await processOutbox(
      auth.admin,
      auth.caller.organization_id,
      40,
    );
    if (origin) {
      after(() => {
        void healStaleSpaceWebhooks({
          admin: auth.admin,
          origin,
          maxChecks: 1,
        }).catch(() => {
          /* cron will retry */
        });
      });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
