/**
 * Live probe: ClickUp space webhook health for all enabled two-way orgs.
 * Usage: npx tsx scripts/clickup-webhook-probe.ts
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnvFile(name: string) {
  const path = resolve(process.cwd(), name);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env) || !process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key || key === "[SENSITIVE]") {
  console.error("Missing Supabase URL / service role key in .env.local");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type SettingsRow = {
  organization_id: string;
  enabled: boolean;
  webhook_enabled: boolean;
  webhook_id: string | null;
  space_id: string | null;
  clickup_team_id: string | null;
  service_profile_id: string | null;
  last_webhook_at: string | null;
  last_webhook_error: string | null;
  last_webhook_check_at: string | null;
  personal_api_token: string | null;
};

async function resolveToken(row: SettingsRow): Promise<string | null> {
  if (row.service_profile_id) {
    const { data } = await admin
      .from("addon_clickup_oauth_tokens")
      .select("access_token, needs_reauth")
      .eq("organization_id", row.organization_id)
      .eq("profile_id", row.service_profile_id)
      .maybeSingle();
    if (data?.access_token && !data.needs_reauth) {
      return data.access_token as string;
    }
  }
  const pat = row.personal_api_token?.trim();
  return pat || null;
}

async function getWebhook(token: string, webhookId: string) {
  const res = await fetch(
    `https://api.clickup.com/api/v2/webhook/${encodeURIComponent(webhookId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, ok: res.ok, json };
}

async function listTeamWebhooks(token: string, teamId: string) {
  const res = await fetch(
    `https://api.clickup.com/api/v2/team/${encodeURIComponent(teamId)}/webhook`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, ok: res.ok, json };
}

function ageLabel(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  const h = Math.round(ms / 3600000);
  if (h < 48) return `${h}h ago (${iso})`;
  const d = Math.round(h / 24);
  return `${d}d ago (${iso})`;
}

async function main() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "(unset locally)";
  console.log("=== ClickUp webhook probe ===");
  console.log("SITE_URL (local env):", siteUrl);
  console.log("");

  const { data: rows, error } = await admin
    .from("addon_clickup_settings")
    .select(
      "organization_id, enabled, webhook_enabled, webhook_id, space_id, clickup_team_id, service_profile_id, last_webhook_at, last_webhook_error, last_webhook_check_at, personal_api_token",
    )
    .eq("enabled", true);

  if (error) {
    console.error("DB error:", error.message);
    process.exit(1);
  }

  if (!rows?.length) {
    console.log("No enabled ClickUp addon orgs found.");
    return;
  }

  for (const raw of rows) {
    const row = raw as SettingsRow;
    console.log("────────────────────────────────────────");
    console.log("org:", row.organization_id);
    console.log("webhook_enabled:", row.webhook_enabled);
    console.log("webhook_id:", row.webhook_id ?? "(null)");
    console.log("space_id:", row.space_id);
    console.log("team_id:", row.clickup_team_id);
    console.log("last_webhook_at:", ageLabel(row.last_webhook_at));
    console.log("last_webhook_check_at:", ageLabel(row.last_webhook_check_at));
    console.log("last_webhook_error:", row.last_webhook_error ?? "(none)");

    if (!row.webhook_enabled || !row.webhook_id) {
      console.log("SKIP: two-way webhook not registered");
      continue;
    }

    const token = await resolveToken(row);
    if (!token) {
      console.log("ERROR: no service OAuth / PAT available to probe ClickUp");
      continue;
    }

    const authHeaderIsBearer = true;
    // Also try raw PAT style if Bearer fails with 401
    let probe = await getWebhook(token, row.webhook_id);
    if (probe.status === 401 && row.personal_api_token?.trim()) {
      const res = await fetch(
        `https://api.clickup.com/api/v2/webhook/${encodeURIComponent(row.webhook_id)}`,
        { headers: { Authorization: row.personal_api_token.trim() } },
      );
      const text = await res.text();
      let json: unknown = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = text;
      }
      probe = { status: res.status, ok: res.ok, json };
      console.log("(retried with PAT header style)");
    }

    console.log("ClickUp GET /webhook status:", probe.status);
    if (!probe.ok) {
      console.log("ClickUp GET body:", JSON.stringify(probe.json).slice(0, 800));
    } else {
      const hook =
        probe.json &&
        typeof probe.json === "object" &&
        "webhook" in (probe.json as object)
          ? (probe.json as { webhook: Record<string, unknown> }).webhook
          : (probe.json as Record<string, unknown>);
      console.log(
        "endpoint:",
        hook?.endpoint ?? "(missing)",
      );
      console.log("status:", hook?.status ?? "(missing)");
      console.log("health:", JSON.stringify(hook?.health ?? null));
      console.log("events:", Array.isArray(hook?.events) ? hook.events.length : "?");
      console.log("space:", JSON.stringify(hook?.space ?? hook?.space_id ?? null));
    }

    if (row.clickup_team_id) {
      let listed = await listTeamWebhooks(token, row.clickup_team_id);
      if (listed.status === 401 && row.personal_api_token?.trim()) {
        const res = await fetch(
          `https://api.clickup.com/api/v2/team/${encodeURIComponent(row.clickup_team_id)}/webhook`,
          { headers: { Authorization: row.personal_api_token.trim() } },
        );
        const text = await res.text();
        let json: unknown = null;
        try {
          json = JSON.parse(text);
        } catch {
          json = text;
        }
        listed = { status: res.status, ok: res.ok, json };
      }
      console.log("ClickUp LIST team webhooks status:", listed.status);
      if (listed.ok) {
        const webhooks =
          listed.json &&
          typeof listed.json === "object" &&
          "webhooks" in (listed.json as object)
            ? (listed.json as { webhooks: { id?: string; endpoint?: string; status?: string; health?: unknown }[] }).webhooks
            : [];
        console.log("team webhook count:", webhooks?.length ?? 0);
        for (const w of webhooks ?? []) {
          const match = String(w.id) === String(row.webhook_id) ? " ← stored id" : "";
          console.log(
            `  - ${w.id} status=${w.status} health=${JSON.stringify(w.health ?? null)} endpoint=${w.endpoint}${match}`,
          );
        }
      } else {
        console.log("LIST body:", JSON.stringify(listed.json).slice(0, 500));
      }
    }

    void authHeaderIsBearer;
  }

  // Pending inbound backlog
  const { data: pending, error: pErr } = await admin
    .from("addon_clickup_inbound_events")
    .select("organization_id, status, created_at, last_error")
    .in("status", ["pending", "error"])
    .order("created_at", { ascending: false })
    .limit(20);
  console.log("────────────────────────────────────────");
  console.log("Recent pending/error inbound events:", pErr?.message ?? (pending?.length ?? 0));
  for (const e of pending ?? []) {
    console.log(
      `  ${e.organization_id} ${e.status} ${e.created_at} ${e.last_error ?? ""}`.slice(0, 200),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
