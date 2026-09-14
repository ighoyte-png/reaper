/** Resolve ClickUp auth (actor OAuth → service OAuth → legacy PAT). */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClickUpAuth } from "@/addons/clickup/types";
import { loadSettings, loadOAuthToken } from "@/addons/clickup/db";
import { ClickUpApiError } from "@/addons/clickup/client";

/** Thrown when an edit must use the actor’s token but they have not connected ClickUp. */
export class ClickUpActorAuthRequiredError extends Error {
  readonly actorProfileId: string | null;

  constructor(actorProfileId: string | null) {
    super(
      actorProfileId
        ? "Connect ClickUp in Account settings so your Reaper edits are attributed to you in ClickUp (not the workspace service account)."
        : "ClickUp task/comment sync needs a known editor. Re-save the item in Reaper after the editor connects ClickUp.",
    );
    this.name = "ClickUpActorAuthRequiredError";
    this.actorProfileId = actorProfileId;
  }
}

export async function resolveClickUpAuth(
  admin: SupabaseClient,
  orgId: string,
  actorProfileId?: string | null,
  opts?: {
    /**
     * When true, never fall back to the org service account / PAT. ClickUp
     * attributes writes to the token owner, so silent fallback mis-credits
     * the service user.
     */
    requireActor?: boolean;
  },
): Promise<ClickUpAuth> {
  if (opts?.requireActor) {
    if (!actorProfileId) {
      throw new ClickUpActorAuthRequiredError(null);
    }
    const actor = await loadOAuthToken(admin, orgId, actorProfileId);
    if (actor?.access_token && !actor.needs_reauth) {
      return { token: actor.access_token, type: "oauth" };
    }
    throw new ClickUpActorAuthRequiredError(actorProfileId);
  }

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

/** True auth failure — token expired/revoked. Do not treat 403 (permissions) as reauth. */
export function isInvalidTokenClickUpError(e: unknown): boolean {
  return e instanceof ClickUpApiError && e.status === 401;
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
