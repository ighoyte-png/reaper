import type { SupabaseClient } from "@supabase/supabase-js";

/** Known addon keys. Extend as new addons ship. */
export const KNOWN_ADDON_KEYS = ["clickup"] as const;
export type AddonKey = (typeof KNOWN_ADDON_KEYS)[number];

export function isKnownAddonKey(value: string): value is AddonKey {
  return (KNOWN_ADDON_KEYS as readonly string[]).includes(value);
}

export async function isAddonAllowed(
  admin: SupabaseClient,
  orgId: string,
  addonKey: string,
): Promise<boolean> {
  const key = addonKey.trim().toLowerCase();
  if (!key) return false;
  const { data } = await admin
    .from("organization_addon_allowlist")
    .select("allowed")
    .eq("organization_id", orgId)
    .eq("addon_key", key)
    .maybeSingle();
  return Boolean(data?.allowed);
}

export async function assertAddonAllowed(
  admin: SupabaseClient,
  orgId: string,
  addonKey: string,
): Promise<void> {
  if (!(await isAddonAllowed(admin, orgId, addonKey))) {
    throw new Error(
      `Addon "${addonKey}" is not allowed for this account. Contact a platform administrator.`,
    );
  }
}

export async function listAddonAllowlist(
  admin: SupabaseClient,
  orgId: string,
): Promise<{ addon_key: string; allowed: boolean }[]> {
  const { data } = await admin
    .from("organization_addon_allowlist")
    .select("addon_key, allowed")
    .eq("organization_id", orgId)
    .order("addon_key", { ascending: true });
  return (data ?? []).map((row) => ({
    addon_key: String(row.addon_key),
    allowed: Boolean(row.allowed),
  }));
}

/** Apply platform default_allowed_addons to an org (upsert allowed=true). */
export async function applyDefaultAddonAllowlist(
  admin: SupabaseClient,
  orgId: string,
): Promise<string[]> {
  const { data: settings } = await admin
    .from("app_settings")
    .select("default_allowed_addons")
    .eq("id", 1)
    .maybeSingle();
  const raw = (settings?.default_allowed_addons as string[] | null) ?? [];
  const keys = [
    ...new Set(
      raw
        .map((k) => String(k).trim().toLowerCase())
        .filter((k) => k.length > 0),
    ),
  ];
  const now = new Date().toISOString();
  for (const key of keys) {
    const { error } = await admin.from("organization_addon_allowlist").upsert(
      {
        organization_id: orgId,
        addon_key: key,
        allowed: true,
        updated_at: now,
      },
      { onConflict: "organization_id,addon_key" },
    );
    if (error) throw new Error(error.message);
  }
  return keys;
}

export async function setAddonAllowlist(
  admin: SupabaseClient,
  orgId: string,
  entries: { addon_key: string; allowed: boolean }[],
): Promise<void> {
  const now = new Date().toISOString();
  for (const entry of entries) {
    const key = entry.addon_key.trim().toLowerCase();
    if (!key) continue;
    const { error } = await admin.from("organization_addon_allowlist").upsert(
      {
        organization_id: orgId,
        addon_key: key,
        allowed: Boolean(entry.allowed),
        updated_at: now,
      },
      { onConflict: "organization_id,addon_key" },
    );
    if (error) throw new Error(error.message);
  }
}
