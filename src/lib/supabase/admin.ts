import { createClient } from "@supabase/supabase-js";

export function isServiceRoleConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/** Server-only. Never import this into client components. */
export function createAdminClient() {
  if (!isServiceRoleConfigured()) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env (server-only, not NEXT_PUBLIC_).",
    );
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
