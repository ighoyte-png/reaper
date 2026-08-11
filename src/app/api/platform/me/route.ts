import { NextResponse } from "next/server";
import {
  evaluatePlatformAdmin,
  requirePlatformAdmin,
} from "@/lib/platform-admin";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ isPlatformAdmin: false });
  }
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const evaluated = evaluatePlatformAdmin(user);
    return NextResponse.json({
      isPlatformAdmin: evaluated.ok,
      ...(evaluated.ok ? {} : { reason: evaluated.reason }),
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
