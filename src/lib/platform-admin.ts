import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
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
  const flag = meta.platform_admin;
  if (flag === true || flag === "true" || flag === 1) return true;
  return meta.role === "platform_admin";
}

export type PlatformAdminEvaluation =
  | { ok: true; email: string }
  | { ok: false; reason: string };

/**
 * Same rules for nav link (/api/platform/me GET) and console gate (POST / requirePlatformAdmin).
 */
export function evaluatePlatformAdmin(
  user: User | null | undefined,
): PlatformAdminEvaluation {
  if (!user) {
    return { ok: false, reason: "Not signed in" };
  }
  if (platformAdminEmails().length === 0) {
    return {
      ok: false,
      reason:
        "Set PLATFORM_ADMIN_EMAILS in .env (comma-separated platform admin emails).",
    };
  }
  const email = user.email ?? "";
  if (!isPlatformAdminEmail(email)) {
    return {
      ok: false,
      reason: "Your email is not in PLATFORM_ADMIN_EMAILS.",
    };
  }
  const allowEmailOnly =
    process.env.PLATFORM_ADMIN_ALLOW_EMAIL_ONLY === "true";
  if (!hasPlatformAdminMetadata(user) && !allowEmailOnly) {
    return {
      ok: false,
      reason:
        "Platform admin requires Auth app_metadata.platform_admin=true (Authentication → Users → user → App Metadata), or set PLATFORM_ADMIN_ALLOW_EMAIL_ONLY=true temporarily.",
    };
  }
  return { ok: true, email };
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

  const evaluated = evaluatePlatformAdmin(user);
  if (!evaluated.ok) {
    const status =
      evaluated.reason === "Not signed in"
        ? 401
        : evaluated.reason.includes("PLATFORM_ADMIN_EMAILS") ||
            evaluated.reason.includes("PLATFORM_ADMIN_ALLOW_EMAIL_ONLY") ||
            evaluated.reason.includes("app_metadata")
          ? 403
          : 403;
    return {
      error: NextResponse.json({ error: evaluated.reason }, { status }),
    };
  }

  return {
    user,
    email: evaluated.email,
    admin: createAdminClient(),
  };
}
