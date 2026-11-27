import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { loginPathWithNext } from "@/lib/paths";

/**
 * Server gate for /admin: must be signed in. Operator authorization is enforced
 * by requirePlatformAdmin on APIs and the client console gate.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isSupabaseConfigured()) {
    redirect(loginPathWithNext("/admin"));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(loginPathWithNext("/admin"));
  }

  return children;
}
