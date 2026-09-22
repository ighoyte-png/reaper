/**
 * Immediately reactivate/recreate suspended ClickUp space webhooks.
 * Usage: npx tsx scripts/clickup-webhook-heal-now.ts
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

const SITE = (
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://app.reaperpm.com"
).replace(/\/$/, "");
const ENDPOINT = `${SITE}/api/addons/clickup/webhook`;

const EVENTS = [
  "taskCreated",
  "taskUpdated",
  "taskStatusUpdated",
  "taskAssigneeUpdated",
  "taskDueDateUpdated",
  "taskCommentPosted",
  "taskCommentUpdated",
  "taskDeleted",
  "taskMoved",
];

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
  personal_api_token: string | null;
};

async function resolveToken(row: SettingsRow): Promise<{
  token: string;
  style: "bearer" | "pat";
} | null> {
  if (row.service_profile_id) {
    const { data } = await admin
      .from("addon_clickup_oauth_tokens")
      .select("access_token, needs_reauth")
      .eq("organization_id", row.organization_id)
      .eq("profile_id", row.service_profile_id)
      .maybeSingle();
    if (data?.access_token && !data.needs_reauth) {
      return { token: data.access_token as string, style: "bearer" };
    }
  }
  const pat = row.personal_api_token?.trim();
  return pat ? { token: pat, style: "pat" } : null;
}

function authHeader(auth: { token: string; style: "bearer" | "pat" }) {
  return {
    Authorization:
      auth.style === "bearer" ? `Bearer ${auth.token}` : auth.token,
    "Content-Type": "application/json",
  };
}

async function listWebhooks(auth: { token: string; style: "bearer" | "pat" }, teamId: string) {
  const res = await fetch(
    `https://api.clickup.com/api/v2/team/${encodeURIComponent(teamId)}/webhook`,
    { headers: authHeader(auth) },
  );
  const json = (await res.json().catch(() => ({}))) as {
    webhooks?: {
      id?: string;
      endpoint?: string;
      health?: { status?: string; fail_count?: number };
      status?: string;
    }[];
  };
  return { ok: res.ok, status: res.status, webhooks: json.webhooks ?? [] };
}

async function putActive(
  auth: { token: string; style: "bearer" | "pat" },
  webhookId: string,
  spaceId: string,
) {
  const res = await fetch(
    `https://api.clickup.com/api/v2/webhook/${encodeURIComponent(webhookId)}`,
    {
      method: "PUT",
      headers: authHeader(auth),
      body: JSON.stringify({
        endpoint: ENDPOINT,
        events: EVENTS,
        status: "active",
        space_id: /^\d+$/.test(spaceId) ? Number(spaceId) : spaceId,
      }),
    },
  );
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text.slice(0, 400) };
}

async function deleteWebhook(
  auth: { token: string; style: "bearer" | "pat" },
  webhookId: string,
) {
  const res = await fetch(
    `https://api.clickup.com/api/v2/webhook/${encodeURIComponent(webhookId)}`,
    { method: "DELETE", headers: authHeader(auth) },
  );
  return res.ok || res.status === 404;
}

async function createWebhook(
  auth: { token: string; style: "bearer" | "pat" },
  teamId: string,
  spaceId: string,
) {
  const res = await fetch(
    `https://api.clickup.com/api/v2/team/${encodeURIComponent(teamId)}/webhook`,
    {
      method: "POST",
      headers: authHeader(auth),
      body: JSON.stringify({
        endpoint: ENDPOINT,
        events: EVENTS,
        space_id: /^\d+$/.test(spaceId) ? Number(spaceId) : spaceId,
      }),
    },
  );
  const json = (await res.json().catch(() => ({}))) as {
    id?: string;
    webhook?: { id?: string; secret?: string };
    secret?: string;
  };
  const id = json.webhook?.id || json.id;
  const secret = json.webhook?.secret || json.secret;
  return {
    ok: res.ok,
    status: res.status,
    id: id ? String(id) : null,
    secret: secret ? String(secret) : null,
  };
}

async function main() {
  console.log("=== ClickUp webhook heal-now ===");
  console.log("endpoint:", ENDPOINT);

  const { data: rows, error } = await admin
    .from("addon_clickup_settings")
    .select(
      "organization_id, enabled, webhook_enabled, webhook_id, space_id, clickup_team_id, service_profile_id, personal_api_token",
    )
    .eq("enabled", true)
    .eq("webhook_enabled", true);

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  for (const raw of rows ?? []) {
    const row = raw as SettingsRow;
    console.log("────────────────────────────────────────");
    console.log("org:", row.organization_id);
    if (!row.webhook_id || !row.clickup_team_id || !row.space_id) {
      console.log("SKIP: incomplete settings");
      continue;
    }

    const auth = await resolveToken(row);
    if (!auth) {
      console.log("ERROR: no token");
      continue;
    }

    const listed = await listWebhooks(auth, row.clickup_team_id);
    if (!listed.ok) {
      console.log("LIST failed:", listed.status);
      continue;
    }

    const hook = listed.webhooks.find((w) => String(w.id) === String(row.webhook_id));
    const health = hook?.health?.status ?? "(missing)";
    const failCount = hook?.health?.fail_count ?? 0;
    console.log("before:", hook ? `health=${health} fail_count=${failCount}` : "not in team list");

    const needsHeal =
      !hook ||
      String(health).toLowerCase() === "suspended" ||
      String(health).toLowerCase().includes("fail") ||
      failCount >= 3 ||
      String(hook.status ?? "").toLowerCase() === "paused";

    if (!needsHeal) {
      console.log("OK: webhook healthy — no action");
      await admin
        .from("addon_clickup_settings")
        .update({
          last_webhook_check_at: new Date().toISOString(),
          last_webhook_error: null,
        })
        .eq("organization_id", row.organization_id);
      continue;
    }

    if (hook && String(health).toLowerCase() === "suspended") {
      console.log("Attempting PUT status=active…");
      const reactivated = await putActive(auth, row.webhook_id, row.space_id);
      if (reactivated.ok) {
        const afterList = await listWebhooks(auth, row.clickup_team_id);
        const after = afterList.webhooks.find(
          (w) => String(w.id) === String(row.webhook_id),
        );
        console.log(
          "reactivated:",
          after
            ? `health=${after.health?.status} fail_count=${after.health?.fail_count}`
            : "ok",
        );
        await admin
          .from("addon_clickup_settings")
          .update({
            last_webhook_check_at: new Date().toISOString(),
            last_webhook_error: null,
          })
          .eq("organization_id", row.organization_id);
        continue;
      }
      console.log("reactivate failed:", reactivated.status, reactivated.body);
    }

    console.log("Recreating webhook…");
    if (row.webhook_id) {
      await deleteWebhook(auth, row.webhook_id);
    }
    const created = await createWebhook(
      auth,
      row.clickup_team_id,
      row.space_id,
    );
    if (!created.ok || !created.id || !created.secret) {
      console.log("CREATE failed:", created.status, created);
      continue;
    }
    const { error: upErr } = await admin
      .from("addon_clickup_settings")
      .update({
        webhook_id: created.id,
        webhook_secret: created.secret,
        webhook_enabled: true,
        last_webhook_check_at: new Date().toISOString(),
        last_webhook_error: null,
      })
      .eq("organization_id", row.organization_id);
    if (upErr) {
      console.log("DB update failed:", upErr.message);
      continue;
    }
    console.log("recreated webhook_id:", created.id);

    const verify = await listWebhooks(auth, row.clickup_team_id);
    const v = verify.webhooks.find((w) => String(w.id) === created.id);
    console.log(
      "after:",
      v
        ? `health=${JSON.stringify(v.health)} endpoint=${v.endpoint}`
        : "created but not listed yet",
    );
  }

  console.log("────────────────────────────────────────");
  console.log("Done. Change a task in ClickUp to confirm inbound sync.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
