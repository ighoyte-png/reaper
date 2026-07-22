import { NextResponse } from "next/server";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { requirePlatformAdmin } from "@/lib/platform-admin";

async function readAllowSignup(): Promise<boolean> {
  if (!isSupabaseConfigured() || !isServiceRoleConfigured()) {
    return true;
  }
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("app_settings")
      .select("allow_workspace_signup")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) return true;
    return Boolean(data.allow_workspace_signup);
  } catch {
    return true;
  }
}

/** Public: login page uses this to hide Create workspace. */
export async function GET() {
  const allow_workspace_signup = await readAllowSignup();
  return NextResponse.json({ allow_workspace_signup });
}

export async function PATCH(request: Request) {
  const auth = await requirePlatformAdmin();
  if ("error" in auth && auth.error) return auth.error;
  const { admin } = auth;

  const body = (await request.json()) as {
    allow_workspace_signup?: boolean;
  };
  if (typeof body.allow_workspace_signup !== "boolean") {
    return NextResponse.json(
      { error: "allow_workspace_signup boolean required" },
      { status: 400 },
    );
  }

  const { data, error } = await admin
    .from("app_settings")
    .upsert({
      id: 1,
      allow_workspace_signup: body.allow_workspace_signup,
    })
    .select("allow_workspace_signup")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    allow_workspace_signup: Boolean(data.allow_workspace_signup),
  });
}
