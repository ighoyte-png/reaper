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

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("Missing env", { url: !!url, key: !!key });
    process.exit(1);
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const now = new Date().toISOString();

  const { count: pending } = await admin
    .from("addon_clickup_inbound_events")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", org)
    .eq("status", "pending");

  const { count: locked } = await admin
    .from("addon_clickup_inbound_events")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", org)
    .eq("status", "pending")
    .not("locked_at", "is", null);

  const { count: future } = await admin
    .from("addon_clickup_inbound_events")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", org)
    .eq("status", "pending")
    .gt("available_at", now);

  const { data: sample } = await admin
    .from("addon_clickup_inbound_events")
    .select("id,status,available_at,locked_at,attempts,last_error,created_at")
    .eq("organization_id", org)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(5);

  console.log({ now, pending, locked, future, sample });
}
main();
