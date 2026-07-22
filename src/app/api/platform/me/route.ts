import { NextResponse } from "next/server";
import {
  isPlatformAdminEmail,
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
    return NextResponse.json({
      isPlatformAdmin: isPlatformAdminEmail(user?.email),
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
