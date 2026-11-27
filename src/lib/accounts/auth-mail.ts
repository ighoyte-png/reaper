import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/** Triggers Auth recovery email (uses dashboard Custom SMTP). */
export async function sendRecoveryEmail(
  email: string,
  redirectTo: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured" };
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return { ok: false, error: "Supabase is not configured" };
  }
  const mailer = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await mailer.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
