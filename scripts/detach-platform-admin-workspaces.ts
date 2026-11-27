/**
 * Remove all workspace memberships for PLATFORM_ADMIN_EMAILS users so they
 * become platform-only (/admin). Handles owned leftover orgs carefully.
 *
 * Usage: npx tsx scripts/detach-platform-admin-workspaces.ts [--apply]
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv(file: string) {
  try {
    const text = readFileSync(resolve(file), "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const i = line.indexOf("=");
      if (i < 0) continue;
      const key = line.slice(0, i).trim();
      let val = line.slice(i + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* missing */
  }
}

loadEnv(".env.local");
loadEnv(".env");
loadEnv(".env.production.local");

const apply = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const emails = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (emails.length === 0) {
    throw new Error("PLATFORM_ADMIN_EMAILS is empty");
  }

  const listed = await admin.auth.admin.listUsers({ perPage: 1000 });

  for (const email of emails) {
    const user = listed.data.users.find((u) => u.email?.toLowerCase() === email);
    if (!user) {
      console.log("skip — no auth user", email);
      continue;
    }
    console.log("\n==", email, user.id, apply ? "APPLY" : "DRY-RUN");

    const { data: mems } = await admin
      .from("organization_memberships")
      .select("organization_id, role, is_owner")
      .eq("user_id", user.id);

    for (const m of mems ?? []) {
      const orgId = String(m.organization_id);
      const { data: org } = await admin
        .from("organizations")
        .select("id, name, slug, owner_user_id")
        .eq("id", orgId)
        .maybeSingle();
      const { count: memberCount } = await admin
        .from("organization_memberships")
        .select("user_id", { count: "exact", head: true })
        .eq("organization_id", orgId);
      const isSoleMember = (memberCount ?? 0) <= 1;
      const isOwner = org?.owner_user_id === user.id;

      console.log(" membership", {
        org: org?.name,
        slug: org?.slug,
        isOwner,
        isSoleMember,
        memberCount,
      });

      if (!apply) continue;

      // Owned solo leftover workspace → delete whole org (bootstrap junk).
      if (isOwner && isSoleMember) {
        const { error } = await admin.from("organizations").delete().eq("id", orgId);
        if (error) throw new Error(`delete org ${org?.slug}: ${error.message}`);
        console.log("  deleted sole-owned org", org?.slug);
        continue;
      }

      if (isOwner && !isSoleMember) {
        // Transfer owner to another admin/owner-ish member before leaving.
        const { data: others } = await admin
          .from("organization_memberships")
          .select("user_id, role, is_owner")
          .eq("organization_id", orgId)
          .neq("user_id", user.id)
          .order("is_owner", { ascending: false });
        const nextOwner =
          (others ?? []).find((o) => o.is_owner) ||
          (others ?? []).find((o) => o.role === "admin") ||
          (others ?? [])[0];
        if (!nextOwner) {
          throw new Error(`No successor owner for ${org?.slug}`);
        }
        await admin
          .from("organizations")
          .update({ owner_user_id: nextOwner.user_id })
          .eq("id", orgId);
        await admin
          .from("organization_memberships")
          .update({ is_owner: true, role: "admin" })
          .eq("organization_id", orgId)
          .eq("user_id", nextOwner.user_id);
        console.log("  transferred ownership →", nextOwner.user_id);
      }

      const { error: delMem } = await admin
        .from("organization_memberships")
        .delete()
        .eq("user_id", user.id)
        .eq("organization_id", orgId);
      if (delMem) throw new Error(delMem.message);
      console.log("  removed membership", org?.slug);
    }

    if (apply) {
      await admin.from("user_active_organization").delete().eq("user_id", user.id);
      // Clear sticky profile org pointer; Enter will recreate as needed.
      await admin
        .from("profiles")
        .update({ organization_id: null })
        .eq("id", user.id);
      console.log(" cleared active org + profile.organization_id");
    }
  }

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to detach.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
