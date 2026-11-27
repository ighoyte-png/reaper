import type { SupabaseClient } from "@supabase/supabase-js";
import * as cu from "@/addons/clickup/client";
import { resolveOrgClickUpAuth } from "@/addons/clickup/auth";
import { loadSettings, upsertSettings, webhookEndpointUri } from "@/addons/clickup/db";
import { ensureSpaceWebhook } from "@/addons/clickup/inbound";

export type ClickUpWebhookLiveHealth = {
  webhookId: string | null;
  endpoint: string | null;
  expectedEndpoint: string;
  endpointMatch: boolean | null;
  healthStatus: string | null;
  failCount: number | null;
  suspended: boolean;
  present: boolean;
};

export type ClickUpInboundQueueEvent = {
  id: string;
  event_name: string | null;
  status: string;
  attempts: number;
  locked_at: string | null;
  available_at: string | null;
  last_error: string | null;
  created_at: string;
  task_id: string | null;
};

export type ClickUpSyncHealth = {
  addonEnabled: boolean;
  webhookEnabled: boolean;
  lastWebhookAt: string | null;
  lastWebhookError: string | null;
  lastWebhookCheckAt: string | null;
  syncedProjectCount: number;
  queue: {
    pending: number;
    locked: number;
    error: number;
    oldestPendingAt: string | null;
    events: ClickUpInboundQueueEvent[];
  };
  webhook: ClickUpWebhookLiveHealth;
  /** overall: ok | degraded | down | off */
  status: "ok" | "degraded" | "down" | "off";
  statusReason: string;
};

function overallStatus(args: {
  addonEnabled: boolean;
  webhookEnabled: boolean;
  webhook: ClickUpWebhookLiveHealth;
  pending: number;
  error: number;
  lastWebhookError: string | null;
}): { status: ClickUpSyncHealth["status"]; statusReason: string } {
  if (!args.addonEnabled) {
    return { status: "off", statusReason: "ClickUp addon is disabled" };
  }
  if (!args.webhookEnabled) {
    return {
      status: "off",
      statusReason: "Two-way sync (ClickUp → Reaper) is off",
    };
  }
  if (!args.webhook.present) {
    return {
      status: "down",
      statusReason: "Webhook is missing in ClickUp — heal to recreate",
    };
  }
  if (args.webhook.suspended || (args.webhook.failCount ?? 0) >= 100) {
    return {
      status: "down",
      statusReason: `Webhook suspended (fail_count=${args.webhook.failCount ?? "?"})`,
    };
  }
  if (args.webhook.endpointMatch === false) {
    return {
      status: "down",
      statusReason: "Webhook points at the wrong endpoint — heal to fix",
    };
  }
  if ((args.webhook.failCount ?? 0) >= 3 || args.error > 0) {
    return {
      status: "degraded",
      statusReason:
        args.error > 0
          ? `${args.error} failed inbound event(s)`
          : `Webhook fail_count=${args.webhook.failCount}`,
    };
  }
  if (args.pending > 20) {
    return {
      status: "degraded",
      statusReason: `${args.pending} pending inbound events`,
    };
  }
  if (args.lastWebhookError) {
    return {
      status: "degraded",
      statusReason: args.lastWebhookError.slice(0, 120),
    };
  }
  return { status: "ok", statusReason: "Webhook active" };
}

export async function getOrgClickUpSyncHealth(args: {
  admin: SupabaseClient;
  orgId: string;
  origin: string;
}): Promise<ClickUpSyncHealth> {
  const { admin, orgId, origin } = args;
  const expectedEndpoint = webhookEndpointUri(origin);
  const settings = await loadSettings(admin, orgId);

  const emptyWebhook: ClickUpWebhookLiveHealth = {
    webhookId: null,
    endpoint: null,
    expectedEndpoint,
    endpointMatch: null,
    healthStatus: null,
    failCount: null,
    suspended: false,
    present: false,
  };

  if (!settings?.enabled) {
    return {
      addonEnabled: false,
      webhookEnabled: false,
      lastWebhookAt: null,
      lastWebhookError: null,
      lastWebhookCheckAt: null,
      syncedProjectCount: 0,
      queue: {
        pending: 0,
        locked: 0,
        error: 0,
        oldestPendingAt: null,
        events: [],
      },
      webhook: emptyWebhook,
      status: "off",
      statusReason: "ClickUp addon is disabled",
    };
  }

  const [
    { count: pending },
    { count: locked },
    { count: errored },
    { data: oldest },
    { data: eventRows },
    { count: syncedProjectCount },
  ] = await Promise.all([
    admin
      .from("addon_clickup_inbound_events")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "pending"),
    admin
      .from("addon_clickup_inbound_events")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "pending")
      .not("locked_at", "is", null),
    admin
      .from("addon_clickup_inbound_events")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "error"),
    admin
      .from("addon_clickup_inbound_events")
      .select("created_at")
      .eq("organization_id", orgId)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    admin
      .from("addon_clickup_inbound_events")
      .select(
        "id, event_name, status, attempts, locked_at, available_at, last_error, created_at, payload",
      )
      .eq("organization_id", orgId)
      .in("status", ["pending", "error"])
      .order("created_at", { ascending: false })
      .limit(40),
    admin
      .from("addon_clickup_project_sync")
      .select("project_id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("enabled", true),
  ]);

  const events: ClickUpInboundQueueEvent[] = (eventRows ?? []).map((row) => {
    const payload = (row.payload ?? {}) as { task_id?: string };
    return {
      id: String(row.id),
      event_name: row.event_name != null ? String(row.event_name) : null,
      status: String(row.status),
      attempts: Number(row.attempts ?? 0),
      locked_at: (row.locked_at as string | null) ?? null,
      available_at: (row.available_at as string | null) ?? null,
      last_error: (row.last_error as string | null) ?? null,
      created_at: String(row.created_at),
      task_id: payload.task_id ? String(payload.task_id) : null,
    };
  });

  let webhook: ClickUpWebhookLiveHealth = {
    ...emptyWebhook,
    webhookId: settings.webhook_id,
  };

  if (settings.webhook_enabled && settings.webhook_id && settings.clickup_team_id) {
    try {
      const auth = await resolveOrgClickUpAuth(admin, orgId);
      const hook = await cu.getWebhook(
        auth,
        settings.webhook_id,
        settings.clickup_team_id,
      );
      const endpoint = String(hook.endpoint ?? "").replace(/\/$/, "") || null;
      const expected = expectedEndpoint.replace(/\/$/, "");
      const healthStatus = String(hook.health?.status ?? hook.status ?? "")
        .toLowerCase() || null;
      const failCount =
        typeof hook.health?.fail_count === "number"
          ? hook.health.fail_count
          : Number(hook.health?.fail_count ?? NaN);
      const suspended =
        healthStatus === "suspended" ||
        String(hook.status ?? "").toLowerCase() === "suspended";
      webhook = {
        webhookId: String(hook.id ?? settings.webhook_id),
        endpoint,
        expectedEndpoint,
        endpointMatch: endpoint ? endpoint === expected : null,
        healthStatus,
        failCount: Number.isFinite(failCount) ? failCount : null,
        suspended,
        present: true,
      };
      await upsertSettings(admin, orgId, {
        last_webhook_check_at: new Date().toISOString(),
      });
    } catch (e) {
      if (e instanceof cu.ClickUpApiError && e.status === 404) {
        webhook = {
          ...emptyWebhook,
          webhookId: settings.webhook_id,
          present: false,
        };
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        webhook = {
          ...emptyWebhook,
          webhookId: settings.webhook_id,
          present: false,
          healthStatus: `error: ${msg.slice(0, 120)}`,
        };
      }
    }
  }

  const pendingCount = pending ?? 0;
  const errorCount = errored ?? 0;
  const { status, statusReason } = overallStatus({
    addonEnabled: Boolean(settings.enabled),
    webhookEnabled: Boolean(settings.webhook_enabled),
    webhook,
    pending: pendingCount,
    error: errorCount,
    lastWebhookError: settings.last_webhook_error,
  });

  return {
    addonEnabled: Boolean(settings.enabled),
    webhookEnabled: Boolean(settings.webhook_enabled),
    lastWebhookAt: settings.last_webhook_at,
    lastWebhookError: settings.last_webhook_error,
    lastWebhookCheckAt: settings.last_webhook_check_at,
    syncedProjectCount: syncedProjectCount ?? 0,
    queue: {
      pending: pendingCount,
      locked: locked ?? 0,
      error: errorCount,
      oldestPendingAt: (oldest?.created_at as string | null) ?? null,
      events,
    },
    webhook,
    status,
    statusReason,
  };
}

/**
 * Force recreate the Space webhook for one org (bypasses heal cooldown).
 * Use when ClickUp has suspended the hook (fail_count=100) or endpoint drifted.
 */
export async function forceHealOrgWebhook(args: {
  admin: SupabaseClient;
  orgId: string;
  origin: string;
}): Promise<{
  action: "recreated" | "noop";
  webhookId: string | null;
  health: ClickUpSyncHealth;
}> {
  const { admin, orgId, origin } = args;
  const settings = await loadSettings(admin, orgId);
  if (!settings?.enabled) {
    throw new Error("ClickUp addon is disabled");
  }
  if (!settings.webhook_enabled) {
    throw new Error("Two-way sync is off — enable it before healing");
  }

  await ensureSpaceWebhook({ admin, orgId, origin });
  await upsertSettings(admin, orgId, {
    last_webhook_check_at: new Date().toISOString(),
    last_webhook_error: null,
  });

  const health = await getOrgClickUpSyncHealth({ admin, orgId, origin });
  return {
    action: "recreated",
    webhookId: health.webhook.webhookId,
    health,
  };
}
