import { NextResponse } from "next/server";
import { canManage } from "@/lib/auth/roles";
import { assertAllowedSiteOrigin } from "@/lib/security/request";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";

export type ManagerApiContext = {
  caller: {
    id: string;
    organization_id: string;
    role: Role;
    full_name: string | null;
  };
  admin: ReturnType<typeof createAdminClient>;
  origin: string;
};

export type ManagerApiFailure = { error: NextResponse };
export type ManagerApiResult = ManagerApiFailure | ManagerApiContext;

export async function requireManagerApiAccess(
  request: Request,
  options?: { roleError?: string },
): Promise<ManagerApiResult> {
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
  if (!canManage(caller.role)) {
    return {
      error: NextResponse.json(
        {
          error:
            options?.roleError ??
            "Only admins and managers can perform this action",
        },
        { status: 403 },
      ),
    };
  }

  return {
    caller,
    admin: createAdminClient(),
    origin: originCheck.origin,
  };
}
