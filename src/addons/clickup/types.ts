/** ClickUp sync addon — types (no core coupling). */

export type ClickUpStatusMap = {
  upcoming: string;
  active: string;
  complete: string;
};

export type ClickUpLinkEntityType =
  | "client"
  | "project"
  | "task_list"
  | "task"
  | "comment"
  | "milestone";

/** Auth material for ClickUp REST calls. */
export type ClickUpAuth = {
  token: string;
  /** oauth → Authorization: Bearer; pat → raw personal token */
  type: "oauth" | "pat";
};

export type AddonClickupSettingsRow = {
  organization_id: string;
  enabled: boolean;
  personal_api_token: string | null;
  oauth_client_id: string | null;
  oauth_client_secret: string | null;
  service_profile_id: string | null;
  clickup_team_id: string | null;
  space_id: string | null;
  space_name: string | null;
  status_map: ClickUpStatusMap | Record<string, string>;
  webhook_enabled: boolean;
  webhook_id: string | null;
  webhook_secret: string | null;
  last_webhook_at: string | null;
  last_webhook_error: string | null;
  last_error: string | null;
  last_synced_at: string | null;
  updated_at: string;
};

/** Safe for client — secrets never included. */
export type AddonClickupSettingsPublic = {
  organization_id: string;
  enabled: boolean;
  has_token: boolean;
  token_masked: string | null;
  has_oauth_app: boolean;
  oauth_client_id_masked: string | null;
  has_service_connection: boolean;
  service_profile_id: string | null;
  clickup_team_id: string | null;
  space_id: string | null;
  space_name: string | null;
  status_map: ClickUpStatusMap;
  webhook_enabled: boolean;
  has_webhook: boolean;
  webhook_endpoint: string | null;
  last_webhook_at: string | null;
  last_webhook_error: string | null;
  last_error: string | null;
  last_synced_at: string | null;
  oauth_redirect_uri: string | null;
};

export type AddonClickupOAuthConnectionPublic = {
  connected: boolean;
  clickup_user_id: string | null;
  needs_reauth: boolean;
  connected_at: string | null;
  is_service_account: boolean;
};

export type AddonClickupProjectSyncRow = {
  organization_id: string;
  project_id: string;
  enabled: boolean;
  link_mode: "link" | "create" | null;
  reconciling: boolean;
  last_reconcile_summary: ReconcileSummary | null;
  last_error: string | null;
  updated_at: string;
};

export type ReconcileSummary = {
  created: number;
  updated: number;
  in_sync: number;
  orphans: number;
  errors: string[];
  finished_at: string;
};

export function emptyStatusMap(): ClickUpStatusMap {
  return { upcoming: "", active: "", complete: "" };
}

export function normalizeStatusMap(
  raw: unknown,
): ClickUpStatusMap {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    upcoming: typeof o.upcoming === "string" ? o.upcoming : "",
    active: typeof o.active === "string" ? o.active : "",
    complete: typeof o.complete === "string" ? o.complete : "",
  };
}

export function maskToken(token: string | null | undefined): string | null {
  if (!token) return null;
  if (token.length < 10) return "****";
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}

export function maskClientId(id: string | null | undefined): string | null {
  if (!id) return null;
  if (id.length < 8) return "****";
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

export function toPublicSettings(
  row: AddonClickupSettingsRow,
  opts?: {
    hasServiceConnection?: boolean;
    oauthRedirectUri?: string | null;
    webhookEndpoint?: string | null;
  },
): AddonClickupSettingsPublic {
  const hasOAuthApp = Boolean(
    row.oauth_client_id?.trim() && row.oauth_client_secret?.trim(),
  );
  const hasLegacyPat = Boolean(row.personal_api_token?.trim());
  return {
    organization_id: row.organization_id,
    enabled: row.enabled,
    has_token: hasLegacyPat || Boolean(opts?.hasServiceConnection),
    token_masked: hasLegacyPat ? maskToken(row.personal_api_token) : null,
    has_oauth_app: hasOAuthApp,
    oauth_client_id_masked: maskClientId(row.oauth_client_id),
    has_service_connection: Boolean(opts?.hasServiceConnection),
    service_profile_id: row.service_profile_id,
    clickup_team_id: row.clickup_team_id,
    space_id: row.space_id,
    space_name: row.space_name,
    status_map: normalizeStatusMap(row.status_map),
    webhook_enabled: Boolean(row.webhook_enabled),
    has_webhook: Boolean(row.webhook_id?.trim()),
    webhook_endpoint: opts?.webhookEndpoint ?? null,
    last_webhook_at: row.last_webhook_at ?? null,
    last_webhook_error: row.last_webhook_error ?? null,
    last_error: row.last_error,
    last_synced_at: row.last_synced_at,
    oauth_redirect_uri: opts?.oauthRedirectUri ?? null,
  };
}
