import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/** Comma-separated allowlist, e.g. PLATFORM_ADMIN_EMAILS=you@example.com,ops@example.com */
export function platformAdminEmails(): string[] {
  const raw = process.env.PLATFORM_ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = platformAdminEmails();
  if (list.length === 0) return false;
  return list.includes(email.trim().toLowerCase());
}

function hasPlatformAdminMetadata(
  user: { app_metadata?: Record<string, unknown> } | null,
): boolean {
  const meta = user?.app_metadata;
  if (!meta || typeof meta !== "object") return false;
  return meta.platform_admin === true || meta.role === "platform_admin";
}

export async function requirePlatformAdmin() {
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
  if (platformAdminEmails().length === 0) {
    return {
      error: NextResponse.json(
        {
          error:
            "Set PLATFORM_ADMIN_EMAILS in .env (comma-separated platform admin emails).",
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

  const email = user.email ?? "";
  if (!isPlatformAdminEmail(email)) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  const allowEmailOnly =
    process.env.PLATFORM_ADMIN_ALLOW_EMAIL_ONLY === "true";
  if (!hasPlatformAdminMetadata(user) && !allowEmailOnly) {
    return {
      error: NextResponse.json(
        {
          error:
            "Platform admin requires app_metadata.platform_admin=true (or set PLATFORM_ADMIN_ALLOW_EMAIL_ONLY=true temporarily).",
        },
        { status: 403 },
      ),
    };
  }

  return {
    user,
    email,
    admin: createAdminClient(),
  };
}
