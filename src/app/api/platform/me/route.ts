import { NextResponse } from "next/server";
import {
  evaluatePlatformAdmin,
  requirePlatformAdmin,
} from "@/lib/platform-admin";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isPlatformOperatorUser } from "@/lib/accounts/operators";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ isPlatformAdmin: false });
  }
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ isPlatformAdmin: false });
    }
    const evaluated = evaluatePlatformAdmin(user);
    if (evaluated.ok) {
      return NextResponse.json({ isPlatformAdmin: true });
    }
    if (isServiceRoleConfigured()) {
      try {
        const admin = createAdminClient();
        if (await isPlatformOperatorUser(admin, user.id)) {
          return NextResponse.json({ isPlatformAdmin: true });
        }
      } catch {
        /* ignore */
      }
    }
    return NextResponse.json({
      isPlatformAdmin: false,
      reason: evaluated.reason,
    });
  } catch {
    return NextResponse.json({ isPlatformAdmin: false });
  }
}

/** Admin-only ping used by the console gate. */
export async function POST() {
  const auth = await requirePlatformAdmin();
  if ("error" in auth && auth.error) return auth.error;
  return NextResponse.json({ ok: true, email: auth.email });
}
