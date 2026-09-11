/** DB helpers for ClickUp addon links & settings (service-role client). */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AddonClickupSettingsRow,
  ClickUpLinkEntityType,
  ClickUpStatusMap,
} from "@/addons/clickup/types";
import { normalizeStatusMap } from "@/addons/clickup/types";

export type AddonClickupOAuthTokenRow = {
  organization_id: string;
  profile_id: string;
  clickup_user_id: string | null;
  access_token: string;
  authorized_team_ids: unknown;
  needs_reauth: boolean;
  connected_at: string;
  updated_at: string;
};

function normalizeSettingsRow(
  data: AddonClickupSettingsRow,
): AddonClickupSettingsRow {
  return {
    ...data,
    status_map: normalizeStatusMap(data.status_map),
    webhook_enabled: Boolean(data.webhook_enabled),
  };
}

export async function loadSettings(
  admin: SupabaseClient,
  orgId: string,
): Promise<AddonClickupSettingsRow | null> {
  const { data, error } = await admin
    .from("addon_clickup_settings")
    .select("*")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return normalizeSettingsRow(data as AddonClickupSettingsRow);
}

export async function loadSettingsByWebhookId(
  admin: SupabaseClient,
  webhookId: string,
): Promise<AddonClickupSettingsRow | null> {
  const { data, error } = await admin
    .from("addon_clickup_settings")
    .select("*")
    .eq("webhook_id", webhookId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return normalizeSettingsRow(data as AddonClickupSettingsRow);
}

export async function upsertSettings(
  admin: SupabaseClient,
  orgId: string,
  patch: Partial<{
    enabled: boolean;
    personal_api_token: string | null;
    oauth_client_id: string | null;
    oauth_client_secret: string | null;
    service_profile_id: string | null;
    clickup_team_id: string | null;
    space_id: string | null;
    space_name: string | null;
    status_map: ClickUpStatusMap;
    webhook_enabled: boolean;
    webhook_id: string | null;
    webhook_secret: string | null;
    last_webhook_at: string | null;
    last_webhook_error: string | null;
    last_error: string | null;
    last_synced_at: string | null;
  }>,
): Promise<AddonClickupSettingsRow> {
  const existing = await loadSettings(admin, orgId);
  const row = {
    organization_id: orgId,
    enabled: patch.enabled ?? existing?.enabled ?? false,
    personal_api_token:
      patch.personal_api_token !== undefined
        ? patch.personal_api_token
        : (existing?.personal_api_token ?? null),
    oauth_client_id:
      patch.oauth_client_id !== undefined
        ? patch.oauth_client_id
        : (existing?.oauth_client_id ?? null),
    oauth_client_secret:
      patch.oauth_client_secret !== undefined
        ? patch.oauth_client_secret
        : (existing?.oauth_client_secret ?? null),
    service_profile_id:
      patch.service_profile_id !== undefined
        ? patch.service_profile_id
        : (existing?.service_profile_id ?? null),
    clickup_team_id:
      patch.clickup_team_id !== undefined
        ? patch.clickup_team_id
        : (existing?.clickup_team_id ?? null),
    space_id:
      patch.space_id !== undefined ? patch.space_id : (existing?.space_id ?? null),
    space_name:
      patch.space_name !== undefined
        ? patch.space_name
        : (existing?.space_name ?? null),
    status_map: normalizeStatusMap(
      patch.status_map ?? existing?.status_map ?? {},
    ),
    webhook_enabled:
      patch.webhook_enabled !== undefined
        ? patch.webhook_enabled
        : (existing?.webhook_enabled ?? false),
    webhook_id:
      patch.webhook_id !== undefined
        ? patch.webhook_id
        : (existing?.webhook_id ?? null),
    webhook_secret:
      patch.webhook_secret !== undefined
        ? patch.webhook_secret
        : (existing?.webhook_secret ?? null),
    last_webhook_at:
      patch.last_webhook_at !== undefined
        ? patch.last_webhook_at
        : (existing?.last_webhook_at ?? null),
    last_webhook_error:
      patch.last_webhook_error !== undefined
        ? patch.last_webhook_error
        : (existing?.last_webhook_error ?? null),
    last_error:
      patch.last_error !== undefined
        ? patch.last_error
        : (existing?.last_error ?? null),
    last_synced_at:
      patch.last_synced_at !== undefined
        ? patch.last_synced_at
        : (existing?.last_synced_at ?? null),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await admin
    .from("addon_clickup_settings")
    .upsert(row)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  // Explicit status_map write — some PostgREST upsert paths have dropped jsonb
  // patches when other columns dominate; force the map the caller asked for.
  if (patch.status_map !== undefined) {
    const mapped = normalizeStatusMap(patch.status_map);
    const { data: forced, error: mapError } = await admin
      .from("addon_clickup_settings")
      .update({
        status_map: mapped,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", orgId)
      .select("*")
      .single();
    if (mapError) throw new Error(mapError.message);
    return normalizeSettingsRow(forced as AddonClickupSettingsRow);
  }

  return normalizeSettingsRow(data as AddonClickupSettingsRow);
}

export async function loadOAuthToken(
  admin: SupabaseClient,
  orgId: string,
  profileId: string,
): Promise<AddonClickupOAuthTokenRow | null> {
  const { data, error } = await admin
    .from("addon_clickup_oauth_tokens")
    .select("*")
    .eq("organization_id", orgId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AddonClickupOAuthTokenRow | null) ?? null;
}

export async function upsertOAuthToken(
  admin: SupabaseClient,
  row: {
    organization_id: string;
    profile_id: string;
    clickup_user_id: string | null;
    access_token: string;
    authorized_team_ids?: string[];
    needs_reauth?: boolean;
  },
): Promise<AddonClickupOAuthTokenRow> {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("addon_clickup_oauth_tokens")
    .upsert({
      organization_id: row.organization_id,
      profile_id: row.profile_id,
      clickup_user_id: row.clickup_user_id,
      access_token: row.access_token,
      authorized_team_ids: row.authorized_team_ids ?? [],
      needs_reauth: row.needs_reauth ?? false,
      connected_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as AddonClickupOAuthTokenRow;
}

export async function deleteOAuthToken(
  admin: SupabaseClient,
  orgId: string,
  profileId: string,
): Promise<void> {
  await admin
    .from("addon_clickup_oauth_tokens")
    .delete()
    .eq("organization_id", orgId)
    .eq("profile_id", profileId);
}

export async function hasOAuthToken(
  admin: SupabaseClient,
  orgId: string,
  profileId: string | null | undefined,
): Promise<boolean> {
  if (!profileId) return false;
  const row = await loadOAuthToken(admin, orgId, profileId);
  return Boolean(row?.access_token && !row.needs_reauth);
}

export function resolveOAuthAppCredentials(
  settings: AddonClickupSettingsRow | null,
): { clientId: string; clientSecret: string } | null {
  const envId = process.env.CLICKUP_OAUTH_CLIENT_ID?.trim();
  const envSecret = process.env.CLICKUP_OAUTH_CLIENT_SECRET?.trim();
  if (envId && envSecret) {
    return { clientId: envId, clientSecret: envSecret };
  }
  const clientId = settings?.oauth_client_id?.trim();
  const clientSecret = settings?.oauth_client_secret?.trim();
  if (clientId && clientSecret) {
    return { clientId, clientSecret };
  }
  return null;
}

export async function getLink(
  admin: SupabaseClient,
  orgId: string,
  entityType: ClickUpLinkEntityType,
  reaperId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("addon_clickup_links")
    .select("clickup_id")
    .eq("organization_id", orgId)
    .eq("entity_type", entityType)
    .eq("reaper_id", reaperId)
    .maybeSingle();
  return data?.clickup_id ?? null;
}

export async function getLinkByClickUpId(
  admin: SupabaseClient,
  orgId: string,
  entityType: ClickUpLinkEntityType,
  clickupId: string,
): Promise<{ reaper_id: string; content_hash: string | null; last_pushed_at: string | null } | null> {
  const { data } = await admin
    .from("addon_clickup_links")
    .select("reaper_id, content_hash, last_pushed_at")
    .eq("organization_id", orgId)
    .eq("entity_type", entityType)
    .eq("clickup_id", clickupId)
    .maybeSingle();
  if (!data) return null;
  return {
    reaper_id: data.reaper_id as string,
    content_hash: (data.content_hash as string | null) ?? null,
    last_pushed_at: (data.last_pushed_at as string | null) ?? null,
  };
}

export async function tryClaimLink(
  admin: SupabaseClient,
  orgId: string,
  entityType: ClickUpLinkEntityType,
  reaperId: string,
  clickupId: string,
  meta?: {
    content_hash?: string | null;
    last_pushed_at?: string | null;
    last_inbound_at?: string | null;
  },
): Promise<"claimed" | "exists"> {
  const { error } = await admin.from("addon_clickup_links").insert({
    organization_id: orgId,
    entity_type: entityType,
    reaper_id: reaperId,
    clickup_id: clickupId,
    updated_at: new Date().toISOString(),
    ...(meta?.content_hash !== undefined
      ? { content_hash: meta.content_hash }
      : {}),
    ...(meta?.last_pushed_at !== undefined
      ? { last_pushed_at: meta.last_pushed_at }
      : {}),
    ...(meta?.last_inbound_at !== undefined
      ? { last_inbound_at: meta.last_inbound_at }
      : {}),
  });
  if (!error) return "claimed";
  // Unique violation on reaper_id or clickup_id — another worker already linked.
  if (error.code === "23505") return "exists";
  throw new Error(error.message);
}

export async function setLink(
  admin: SupabaseClient,
  orgId: string,
  entityType: ClickUpLinkEntityType,
  reaperId: string,
  clickupId: string,
  meta?: {
    content_hash?: string | null;
    last_pushed_at?: string | null;
    last_inbound_at?: string | null;
  },
): Promise<void> {
  const { error } = await admin.from("addon_clickup_links").upsert({
    organization_id: orgId,
    entity_type: entityType,
    reaper_id: reaperId,
    clickup_id: clickupId,
    updated_at: new Date().toISOString(),
    ...(meta?.content_hash !== undefined
      ? { content_hash: meta.content_hash }
      : {}),
    ...(meta?.last_pushed_at !== undefined
      ? { last_pushed_at: meta.last_pushed_at }
      : {}),
    ...(meta?.last_inbound_at !== undefined
      ? { last_inbound_at: meta.last_inbound_at }
      : {}),
  });
  if (error) throw new Error(error.message);
}

export async function touchLinkPushMeta(
  admin: SupabaseClient,
  orgId: string,
  entityType: ClickUpLinkEntityType,
  reaperId: string,
  contentHash: string,
): Promise<void> {
  await admin
    .from("addon_clickup_links")
    .update({
      content_hash: contentHash,
      last_pushed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", orgId)
    .eq("entity_type", entityType)
    .eq("reaper_id", reaperId);
}

export async function deleteLink(
  admin: SupabaseClient,
  orgId: string,
  entityType: ClickUpLinkEntityType,
  reaperId: string,
): Promise<void> {
  await admin
    .from("addon_clickup_links")
    .delete()
    .eq("organization_id", orgId)
    .eq("entity_type", entityType)
    .eq("reaper_id", reaperId);
}

export async function linksForProjectTasks(
  admin: SupabaseClient,
  orgId: string,
  taskIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (taskIds.length === 0) return map;
  const { data } = await admin
    .from("addon_clickup_links")
    .select("reaper_id, clickup_id")
    .eq("organization_id", orgId)
    .eq("entity_type", "task")
    .in("reaper_id", taskIds);
  for (const row of data ?? []) {
    map.set(row.reaper_id, row.clickup_id);
  }
  return map;
}

export async function suppressOutbound(
  admin: SupabaseClient,
  orgId: string,
  entityType: string,
  reaperId: string,
  seconds = 45,
): Promise<void> {
  const { error } = await admin.rpc("addon_clickup_suppress_outbound", {
    p_org: orgId,
    p_entity_type: entityType,
    p_reaper_id: reaperId,
    p_seconds: seconds,
  });
  if (error) {
    // Fallback direct upsert if RPC not migrated yet
    const until = new Date(Date.now() + Math.max(seconds, 5) * 1000).toISOString();
    await admin.from("addon_clickup_suppress").upsert({
      organization_id: orgId,
      entity_type: entityType,
      reaper_id: reaperId,
      until,
    });
  }
}

export function webhookEndpointUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/addons/clickup/webhook`;
}
