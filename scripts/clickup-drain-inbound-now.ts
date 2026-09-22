/**
 * Drain pending ClickUp inbound events locally.
 * Usage: npx tsx scripts/clickup-drain-inbound-now.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { processInbound } from "../src/addons/clickup/inbound";

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
if (!url || !key) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const org = "23ca2067-5f6f-401c-a8bb-03f819f1c412";
  let processed = 0;
  let ignored = 0;
  let errors = 0;
  for (let i = 0; i < 15; i += 1) {
    const r = await processInbound(admin, org, 40);
    processed += r.processed;
    ignored += r.ignored;
    errors += r.errors.length;
    console.log(`batch ${i}:`, {
      processed: r.processed,
      ignored: r.ignored,
      errors: r.errors.slice(0, 3),
    });
    if (r.processed + r.ignored === 0) break;
  }
  console.log("TOTAL", { processed, ignored, errors });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
