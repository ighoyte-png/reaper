import { NextResponse } from "next/server";
import { assertAllowedSiteOrigin } from "@/lib/security/request";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";

export type AuthApiContext = {
  userId: string;
  caller: {
    id: string;
    organization_id: string;
    role: Role;
    full_name: string | null;
  };
  admin: ReturnType<typeof createAdminClient>;
  supabase: Awaited<ReturnType<typeof createClient>>;
  origin: string;
};

export type AuthApiResult =
  | AuthApiContext
  | { error: NextResponse };

/** Any signed-in org member (for storage uploads / signed URLs). */
export async function requireAuthApiAccess(
  request: Request,
): Promise<AuthApiResult> {
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

  const originCheck = assertAllowedSiteOrigin(request);
  if (!originCheck.ok) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
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
    .select("id, organization_id, role, full_name")
    .eq("id", user.id)
    .single();

  if (callerError || !caller) {
    return {
      error: NextResponse.json({ error: "No profile" }, { status: 403 }),
    };
  }

  return {
    userId: user.id,
    caller,
    admin: createAdminClient(),
    supabase,
    origin: originCheck.origin,
  };
}
