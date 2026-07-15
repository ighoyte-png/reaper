import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { canManage } from "@/lib/auth/roles";
import { generateShareToken, publicShareUrl } from "@/lib/share/token";

async function requireManager() {
  if (!isSupabaseConfigured()) {
    return {
      error: NextResponse.json(
        { error: "Supabase is not configured" },
        { status: 400 },
      ),
    };
  }
  if (!isServiceRoleConfigured()) {
    return {
      error: NextResponse.json(
        {
          error:
            "Add SUPABASE_SERVICE_ROLE_KEY to .env (Project Settings → API → secret / service_role).",
        },
        { status: 400 },
      ),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return {
      error: NextResponse.json({ error: "Not signed in" }, { status: 401 }),
    };
  }

  const { data: caller, error: callerError } = await supabase
    .from("profiles")
    .select("id, organization_id, role")
    .eq("id", user.id)
    .single();

  if (callerError || !caller) {
    return {
      error: NextResponse.json({ error: "No profile" }, { status: 403 }),
    };
  }
  if (!canManage(caller.role)) {
    return {
      error: NextResponse.json(
        { error: "Only admins and managers can manage the public link" },
        { status: 403 },
      ),
    };
  }

  return { caller, admin: createAdminClient() };
}

function originFrom(request: Request): string {
  return (
    request.headers.get("origin") ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000"
  );
}

/** Current public-link status for the signed-in org. */
export async function GET(request: Request) {
  try {
    const auth = await requireManager();
    if ("error" in auth && auth.error) return auth.error;
    const { caller, admin } = auth as {
      caller: { organization_id: string };
      admin: ReturnType<typeof createAdminClient>;
    };

    const { data: org, error } = await admin
      .from("organizations")
      .select("id, name, share_enabled, share_token")
      .eq("id", caller.organization_id)
      .single();

    if (error || !org) {
      return NextResponse.json(
        { error: error?.message || "Organization not found" },
        { status: 404 },
      );
    }

    const enabled = Boolean(org.share_enabled);
    const token = (org.share_token as string | null) ?? null;
    const origin = originFrom(request);

    return NextResponse.json({
      enabled,
      token: enabled ? token : null,
      url: enabled && token ? publicShareUrl(origin, token) : null,
      orgName: org.name,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}

/**
 * Body: { action: "enable" | "disable" | "rotate" }
 * enable creates a token if missing; rotate always issues a new token & keeps enabled.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireManager();
    if ("error" in auth && auth.error) return auth.error;
    const { caller, admin } = auth as {
      caller: { organization_id: string };
      admin: ReturnType<typeof createAdminClient>;
    };

    const body = (await request.json()) as { action?: string };
    const action = body.action?.trim();
    if (action !== "enable" && action !== "disable" && action !== "rotate") {
      return NextResponse.json(
        { error: "action must be enable, disable, or rotate" },
        { status: 400 },
      );
    }

    const { data: org, error: orgError } = await admin
      .from("organizations")
      .select("id, name, share_enabled, share_token")
      .eq("id", caller.organization_id)
      .single();

    if (orgError || !org) {
      return NextResponse.json(
        { error: orgError?.message || "Organization not found" },
        { status: 404 },
      );
    }

    let share_enabled = Boolean(org.share_enabled);
    let share_token = (org.share_token as string | null) ?? null;

    if (action === "disable") {
      share_enabled = false;
    } else if (action === "enable") {
      share_enabled = true;
      if (!share_token) share_token = generateShareToken();
    } else if (action === "rotate") {
      share_enabled = true;
      share_token = generateShareToken();
    }

    const { error: updateError } = await admin
      .from("organizations")
      .update({ share_enabled, share_token })
      .eq("id", caller.organization_id);

    if (updateError) {
      const msg = updateError.message;
      if (/share_enabled|share_token/i.test(msg)) {
        return NextResponse.json(
          {
            error:
              "Public share columns missing — apply supabase/migrations/014_org_public_share.sql",
          },
          { status: 400 },
        );
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const origin = originFrom(request);
    return NextResponse.json({
      ok: true,
      enabled: share_enabled,
      token: share_enabled ? share_token : null,
      url:
        share_enabled && share_token
          ? publicShareUrl(origin, share_token)
          : null,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
