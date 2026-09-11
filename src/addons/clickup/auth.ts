/** Resolve ClickUp auth (actor OAuth → service OAuth → legacy PAT). */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClickUpAuth } from "@/addons/clickup/types";
import { loadSettings, loadOAuthToken } from "@/addons/clickup/db";
import { ClickUpApiError } from "@/addons/clickup/client";

export async function resolveClickUpAuth(
  admin: SupabaseClient,
  orgId: string,
  actorProfileId?: string | null,
): Promise<ClickUpAuth> {
  if (actorProfileId) {
    const actor = await loadOAuthToken(admin, orgId, actorProfileId);
    if (actor?.access_token && !actor.needs_reauth) {
      return { token: actor.access_token, type: "oauth" };
    }
  }

  const settings = await loadSettings(admin, orgId);
  if (settings?.service_profile_id) {
    const service = await loadOAuthToken(
      admin,
      orgId,
      settings.service_profile_id,
    );
    if (service?.access_token && !service.needs_reauth) {
      return { token: service.access_token, type: "oauth" };
    }
  }

  const pat = settings?.personal_api_token?.trim();
  if (pat) {
    return { token: pat, type: "pat" };
  }

  throw new Error(
    "No ClickUp credentials available. Connect ClickUp (OAuth) or configure a service account.",
  );
}

/** Org-level auth for admin Space picker / reconcile (service or legacy PAT). */
export async function resolveOrgClickUpAuth(
  admin: SupabaseClient,
  orgId: string,
): Promise<ClickUpAuth> {
  return resolveClickUpAuth(admin, orgId, null);
}

export async function markOAuthNeedsReauth(
  admin: SupabaseClient,
  orgId: string,
  profileId: string,
): Promise<void> {
  await admin
    .from("addon_clickup_oauth_tokens")
    .update({
      needs_reauth: true,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", orgId)
    .eq("profile_id", profileId);
}

export function isUnauthorizedClickUpError(e: unknown): boolean {
  return e instanceof ClickUpApiError && (e.status === 401 || e.status === 403);
}

/** Deleted / missing ClickUp entity (stale id-map after manual delete). */
export function isNotFoundClickUpError(e: unknown): boolean {
  if (!(e instanceof ClickUpApiError)) return false;
  if (e.status === 404) return true;
  return /not found|deleted|ITEM_013|ACCESS_100|FOLDER_|LIST_/i.test(e.body);
}
