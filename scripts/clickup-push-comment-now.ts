/**
 * One-off: push a Reaper comment body to its linked ClickUp comment.
 * Usage: npx tsx scripts/clickup-push-comment-now.ts <comment-reaper-id>
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
    if (!(key in process.env) || !process.env[key]) process.env[key] = val;
  }
}
loadEnvFile(".env.local");
loadEnvFile(".env");

const org = "23ca2067-5f6f-401c-a8bb-03f819f1c412";
const commentId = process.argv[2]?.trim();
if (!commentId) {
  console.error("Usage: npx tsx scripts/clickup-push-comment-now.ts <comment-id>");
  process.exit(1);
}

function htmlToPlain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function main() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: settings } = await admin
    .from("addon_clickup_settings")
    .select("service_profile_id, personal_api_token")
    .eq("organization_id", org)
    .maybeSingle();

  let token: string | null = null;
  if (settings?.service_profile_id) {
    const { data: t } = await admin
      .from("addon_clickup_oauth_tokens")
      .select("access_token, needs_reauth")
      .eq("organization_id", org)
      .eq("profile_id", settings.service_profile_id)
      .maybeSingle();
    if (t?.access_token && !t.needs_reauth) token = t.access_token as string;
  }
  if (!token && settings?.personal_api_token) {
    token = String(settings.personal_api_token).trim();
  }
  if (!token) throw new Error("No ClickUp token");

  const { data: comment } = await admin
    .from("task_comments")
    .select("id, body")
    .eq("id", commentId)
    .maybeSingle();
  if (!comment) throw new Error("Comment not found");

  const { data: link } = await admin
    .from("addon_clickup_links")
    .select("clickup_id")
    .eq("organization_id", org)
    .eq("entity_type", "comment")
    .eq("reaper_id", commentId)
    .maybeSingle();
  if (!link?.clickup_id) throw new Error("No ClickUp link for comment");

  const text = htmlToPlain(String(comment.body ?? ""));
  console.log("pushing to CU comment", link.clickup_id, "text:", text);

  const res = await fetch(
    `https://api.clickup.com/api/v2/comment/${encodeURIComponent(link.clickup_id)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ comment_text: text }),
    },
  );
  const body = await res.text();
  console.log("CU status", res.status, body.slice(0, 300));
  if (!res.ok) process.exit(1);

  await admin
    .from("addon_clickup_links")
    .update({
      last_pushed_at: new Date().toISOString(),
      content_hash: `c:${text.toLowerCase()}`,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", org)
    .eq("entity_type", "comment")
    .eq("reaper_id", commentId);

  // Clear any leftover outbox row for this comment
  await admin
    .from("addon_clickup_outbox")
    .delete()
    .eq("organization_id", org)
    .eq("entity_type", "comment")
    .eq("reaper_id", commentId);

  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
