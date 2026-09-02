import type { SupabaseClient } from "@supabase/supabase-js";
import { isR2Configured, getStorageProvider } from "@/lib/storage";

/** Resolve an org branding attachment (or demo data URL) to a displayable URL. */
export async function resolveOrgBrandingLogoUrl(
  admin: SupabaseClient,
  value: string | null | undefined,
  opts?: { expiresIn?: number },
): Promise<string | null> {
  if (!value) return null;
  if (
    value.startsWith("data:") ||
    /^https?:\/\//i.test(value) ||
    value.startsWith("/")
  ) {
    return value;
  }
  if (!isR2Configured()) return null;

  const { data: row, error } = await admin
    .from("attachments")
    .select("id, storage_key, ready, organization_id")
    .eq("id", value)
    .maybeSingle();
  if (error || !row?.ready || !row.storage_key) return null;

  try {
    const storage = getStorageProvider();
    return await storage.createSignedDownloadUrl(String(row.storage_key), {
      expiresIn: opts?.expiresIn ?? 60 * 60,
    });
  } catch {
    return null;
  }
}
