import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isPlatformOperatorUser } from "@/lib/accounts/operators";

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
 * Sync rules for nav (env allowlist + metadata). DB operators are checked in
 * requirePlatformAdmin / GET me with service role.
 */
export function evaluatePlatformAdmin(
  user: User | null | undefined,
): PlatformAdminEvaluation {
  if (!user) {
    return { ok: false, reason: "Not signed in" };
  }
  const email = user.email ?? "";
  const allowEmailOnly =
    process.env.PLATFORM_ADMIN_ALLOW_EMAIL_ONLY === "true";

  if (isPlatformAdminEmail(email)) {
    if (hasPlatformAdminMetadata(user) || allowEmailOnly) {
      return { ok: true, email };
    }
    return {
      ok: false,
      reason:
        "Platform admin requires Auth app_metadata.platform_admin=true (Authentication → Users → user → App Metadata), or set PLATFORM_ADMIN_ALLOW_EMAIL_ONLY=true temporarily.",
    };
  }

  // Operators table users still need metadata after grant; soft-fail here —
  // async path confirms platform_operators.
  if (hasPlatformAdminMetadata(user)) {
    return { ok: true, email };
  }

  if (platformAdminEmails().length === 0) {
    return {
      ok: false,
      reason:
        "Set PLATFORM_ADMIN_EMAILS in .env (comma-separated platform admin emails), or grant an operator in /admin.",
    };
  }

  return {
    ok: false,
    reason: "Your email is not in PLATFORM_ADMIN_EMAILS.",
  };
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

  const admin = createAdminClient();
  const evaluated = evaluatePlatformAdmin(user);
  if (evaluated.ok) {
    return {
      user,
      email: evaluated.email,
      admin,
    };
  }

  // In-app operators (platform_operators) even if not on env allowlist.
  try {
    if (await isPlatformOperatorUser(admin, user.id)) {
      return {
        user,
        email: (user.email ?? "").toLowerCase(),
        admin,
      };
    }
  } catch (e) {
    console.error("[requirePlatformAdmin] operators check", e);
  }

  return {
    error: NextResponse.json({ error: evaluated.reason }, { status: 403 }),
  };
}
