/**
 * Two-agency RLS suite for migration 057.
 *
 * Creates ephemeral orgs A/B, runs the hardening checklist as real JWT sessions,
 * then deletes the fixture users and orgs.
 *
 * Requires staging (or local) env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Run: npm run security:rls
 * Optional: SECURITY_RLS_KEEP=1 to skip cleanup on failure for debugging.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type CheckResult = { name: string; ok: boolean; detail?: string };

const PASSWORD = `SecTest-${randomBytes(18).toString("base64url")}!a1`;
const RUN_ID = randomUUID().slice(0, 8);
const KEEP = process.env.SECURITY_RLS_KEEP === "1";

function loadEnvFiles() {
  for (const file of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function client(url: string, key: string) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function authedClient(
  url: string,
  anon: string,
  email: string,
  password: string,
) {
  const sb = client(url, anon);
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return sb;
}

function expectFail(
  name: string,
  error: { message?: string } | null,
  results: CheckResult[],
) {
  if (error) {
    results.push({ name, ok: true, detail: error.message });
  } else {
    results.push({ name, ok: false, detail: "expected error, succeeded" });
  }
}

async function createUser(
  admin: SupabaseClient,
  email: string,
  fullName: string,
) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) {
    throw new Error(`createUser ${email}: ${error?.message ?? "no user"}`);
  }
  return data.user.id;
}

async function main() {
  loadEnvFiles();
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anon = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const service = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const admin = client(url, service);
  const results: CheckResult[] = [];
  const userIds: string[] = [];
  const orgIds: string[] = [];

  const emailAAdmin = `sec-a-admin-${RUN_ID}@example.com`;
  const emailAMember = `sec-a-member-${RUN_ID}@example.com`;
  const emailBAdmin = `sec-b-admin-${RUN_ID}@example.com`;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const personAAdminId = randomUUID();
  const personAMemberId = randomUUID();
  const personBAdminId = randomUUID();
  const projectAId = randomUUID();
  const listAId = randomUUID();
  const taskAId = randomUUID();
  const bulletinRestrictedId = randomUUID();
  const bulletinPublicId = randomUUID();

  orgIds.push(orgAId, orgBId);

  console.log(`security-rls-suite: run ${RUN_ID}`);
  console.log(`  url: ${url}`);

  try {
    // Probe that 057 helpers exist
    {
      const { error } = await admin.rpc("current_org_id");
      // service role has no auth.uid — null is fine; missing function is not
      if (error && /could not find the function|schema cache/i.test(error.message)) {
        throw new Error(
          "Migration 057 helpers missing. Apply supabase/migrations/057_security_hardening.sql first.",
        );
      }
    }

    const userAAdmin = await createUser(admin, emailAAdmin, "Sec A Admin");
    const userAMember = await createUser(admin, emailAMember, "Sec A Member");
    const userBAdmin = await createUser(admin, emailBAdmin, "Sec B Admin");
    userIds.push(userAAdmin, userAMember, userBAdmin);

    // Seed orgs + rows via service role (bypasses RLS; triggers still apply)
    const { error: orgErr } = await admin.from("organizations").insert([
      {
        id: orgAId,
        name: `Sec Test A ${RUN_ID}`,
        slug: `sec-test-a-${RUN_ID}`,
      },
      {
        id: orgBId,
        name: `Sec Test B ${RUN_ID}`,
        slug: `sec-test-b-${RUN_ID}`,
      },
    ]);
    if (orgErr) throw new Error(`seed orgs: ${orgErr.message}`);

    const { error: profileErr } = await admin.from("profiles").insert([
      {
        id: userAAdmin,
        organization_id: orgAId,
        email: emailAAdmin,
        full_name: "Sec A Admin",
        role: "admin",
      },
      {
        id: userAMember,
        organization_id: orgAId,
        email: emailAMember,
        full_name: "Sec A Member",
        role: "member",
      },
      {
        id: userBAdmin,
        organization_id: orgBId,
        email: emailBAdmin,
        full_name: "Sec B Admin",
        role: "admin",
      },
    ]);
    if (profileErr) throw new Error(`seed profiles: ${profileErr.message}`);

    const { error: memErr } = await admin.from("organization_memberships").insert([
      { user_id: userAAdmin, organization_id: orgAId, role: "admin" },
      { user_id: userAMember, organization_id: orgAId, role: "member" },
      { user_id: userBAdmin, organization_id: orgBId, role: "admin" },
    ]);
    if (memErr) throw new Error(`seed memberships: ${memErr.message}`);

    const { error: activeErr } = await admin.from("user_active_organization").insert([
      { user_id: userAAdmin, organization_id: orgAId },
      { user_id: userAMember, organization_id: orgAId },
      { user_id: userBAdmin, organization_id: orgBId },
    ]);
    if (activeErr) throw new Error(`seed active org: ${activeErr.message}`);

    const { error: peopleErr } = await admin.from("people").insert([
      {
        id: personAAdminId,
        organization_id: orgAId,
        profile_id: userAAdmin,
        name: "Sec A Admin",
        email: emailAAdmin,
        cost_rate: 100,
      },
      {
        id: personAMemberId,
        organization_id: orgAId,
        profile_id: userAMember,
        name: "Sec A Member",
        email: emailAMember,
        cost_rate: 80,
      },
      {
        id: personBAdminId,
        organization_id: orgBId,
        profile_id: userBAdmin,
        name: "Sec B Admin",
        email: emailBAdmin,
        cost_rate: 90,
      },
    ]);
    if (peopleErr) throw new Error(`seed people: ${peopleErr.message}`);

    const { error: projectErr } = await admin.from("projects").insert({
      id: projectAId,
      organization_id: orgAId,
      name: "Sec Project",
      slug: `sec-project-${RUN_ID}`,
      budget_hours: 40,
      budget_mode: "hours",
      status: "active",
    });
    if (projectErr) throw new Error(`seed project: ${projectErr.message}`);

    const { error: listErr } = await admin.from("task_lists").insert({
      id: listAId,
      organization_id: orgAId,
      project_id: projectAId,
      name: "Sec List",
      sort_order: 0,
    });
    if (listErr) throw new Error(`seed task_lists: ${listErr.message}`);

    const { error: taskErr } = await admin.from("tasks").insert({
      id: taskAId,
      organization_id: orgAId,
      project_id: projectAId,
      list_id: listAId,
      title: "Roster task",
      status: "upcoming",
      sort_order: 0,
      assignee_person_id: personAMemberId,
    });
    if (taskErr) throw new Error(`seed task: ${taskErr.message}`);

    const { error: rosterErr } = await admin.from("project_members").insert({
      organization_id: orgAId,
      project_id: projectAId,
      person_id: personAMemberId,
    });
    if (rosterErr) throw new Error(`seed project_members: ${rosterErr.message}`);

    const { error: bulletinErr } = await admin.from("bulletins").insert([
      {
        id: bulletinPublicId,
        organization_id: orgAId,
        title: "Public bulletin",
        body: "visible",
        audience: "all",
        audience_person_ids: [],
        created_by_profile_id: userAAdmin,
      },
      {
        id: bulletinRestrictedId,
        organization_id: orgAId,
        title: "Staff only",
        body: "secret",
        audience: "people",
        audience_person_ids: [personAAdminId],
        created_by_profile_id: userAAdmin,
      },
    ]);
    if (bulletinErr) throw new Error(`seed bulletins: ${bulletinErr.message}`);

    // --- Member A assertions ---
    const member = await authedClient(url, anon, emailAMember, PASSWORD);

    {
      const { error } = await member
        .from("profiles")
        .update({ role: "admin" })
        .eq("id", userAMember);
      expectFail("member cannot self-escalate role", error, results);
    }

    {
      const { error } = await member
        .from("profiles")
        .update({ organization_id: orgBId })
        .eq("id", userAMember);
      expectFail("member cannot change organization_id", error, results);
    }

    {
      const { data, error } = await member
        .from("people")
        .update({ cost_rate: 1 })
        .eq("id", personAMemberId)
        .select("cost_rate")
        .maybeSingle();
      const blocked =
        Boolean(error) || data == null || Number(data.cost_rate) !== 1;
      results.push({
        name: "member cannot update cost_rate",
        ok: blocked,
        detail: error?.message
          ?? (data == null
            ? "update matched 0 rows (RLS)"
            : Number(data.cost_rate) === 1
              ? "cost_rate changed to 1"
              : `cost_rate remains ${data.cost_rate}`),
      });
    }

    {
      const before = await member
        .from("tasks")
        .select("title")
        .eq("id", taskAId)
        .maybeSingle();
      const { data, error } = await member
        .from("tasks")
        .update({ title: "hacked title" })
        .eq("id", taskAId)
        .select("title")
        .maybeSingle();
      const blocked =
        Boolean(error) ||
        data == null ||
        data.title !== "hacked title" ||
        (before.data?.title != null && data.title === before.data.title);
      results.push({
        name: "member cannot update task title",
        ok: blocked,
        detail: error?.message
          ?? (data?.title === "hacked title"
            ? "title changed"
            : "title unchanged / blocked"),
      });
    }

    {
      const { data, error } = await member
        .from("tasks")
        .update({ status: "complete" })
        .eq("id", taskAId)
        .select("status")
        .maybeSingle();
      results.push({
        name: "member can update task status on roster",
        ok: !error && data?.status === "complete",
        detail: error?.message ?? (data ? `status=${data.status}` : "no row"),
      });
    }

    {
      const { data, error } = await member
        .from("bulletins")
        .select("id, audience")
        .eq("organization_id", orgAId);
      if (error) {
        results.push({
          name: "member bulletin audience RLS",
          ok: false,
          detail: error.message,
        });
      } else {
        const ids = (data ?? []).map((b) => b.id);
        const leaked = ids.includes(bulletinRestrictedId);
        const seesPublic = ids.includes(bulletinPublicId);
        results.push({
          name: "member cannot see restricted bulletin",
          ok: !leaked && seesPublic,
          detail: leaked
            ? "restricted bulletin visible"
            : !seesPublic
              ? "public bulletin missing"
              : undefined,
        });
      }
    }

    {
      const { data, error } = await member
        .from("projects")
        .select("id")
        .eq("organization_id", orgBId);
      results.push({
        name: "member cannot see org B projects",
        ok: !error && (data?.length ?? 0) === 0,
        detail: error?.message ?? (data?.length ? `saw ${data.length}` : undefined),
      });
    }

    // Multi-membership: invite existing Auth user into a second org.
    {
      const { error: memUpsertErr } = await admin
        .from("organization_memberships")
        .upsert(
          {
            user_id: userAMember,
            organization_id: orgBId,
            role: "member",
          },
          { onConflict: "user_id,organization_id" },
        );
      results.push({
        name: "existing auth user can join second org membership",
        ok: !memUpsertErr,
        detail: memUpsertErr?.message,
      });

      const dual = await authedClient(url, anon, emailAMember, PASSWORD);
      const { data: switched, error: switchErr } = await dual.rpc(
        "switch_organization",
        { p_organization_id: orgBId },
      );
      results.push({
        name: "switch_organization updates active org",
        ok: !switchErr && switched?.id === orgBId,
        detail: switchErr?.message ?? (switched ? `id=${switched.id}` : "no org"),
      });

      const { data: orgBProjects, error: orgBErr } = await dual
        .from("projects")
        .select("id")
        .eq("organization_id", orgBId);
      // org B may have 0 projects; visibility must not error and must not leak A-only after switch
      const { data: orgAProjects, error: orgAErr } = await dual
        .from("projects")
        .select("id")
        .eq("organization_id", orgAId);
      results.push({
        name: "after switch, RLS scoped to new active org",
        ok:
          !orgBErr &&
          !orgAErr &&
          (orgAProjects?.length ?? 0) === 0 &&
          (orgBProjects?.length ?? 0) === 0,
        detail:
          orgBErr?.message ||
          orgAErr?.message ||
          (orgAProjects?.length
            ? `still saw ${orgAProjects.length} org-A project(s)`
            : undefined),
      });

      // Soft-delete style: remove only the second membership; Auth user remains.
      const { error: dropMemErr } = await admin
        .from("organization_memberships")
        .delete()
        .eq("user_id", userAMember)
        .eq("organization_id", orgBId);
      const { count: remaining } = await admin
        .from("organization_memberships")
        .select("organization_id", { count: "exact", head: true })
        .eq("user_id", userAMember);
      results.push({
        name: "removing one membership keeps other memberships",
        ok: !dropMemErr && (remaining ?? 0) === 1,
        detail:
          dropMemErr?.message ??
          `remaining memberships=${remaining ?? 0}`,
      });

      await admin.from("user_active_organization").upsert({
        user_id: userAMember,
        organization_id: orgAId,
        updated_at: new Date().toISOString(),
      });
    }

    // Same-org trigger (service role bypasses RLS; trigger still fires)
    {
      const { error } = await admin.from("assignments").insert({
        organization_id: orgAId,
        person_id: personBAdminId,
        project_id: projectAId,
        start_date: "2030-01-06",
        end_date: "2030-01-10",
        hours_per_day: 8,
        status: "confirmed",
      });
      expectFail("cross-org assignment rejected by same-org trigger", error, results);
    }

    // Storage: org-A user writing under org-B path
    {
      const path = `${orgBId}/${personBAdminId}/probe-${RUN_ID}.txt`;
      const { error } = await member.storage
        .from("person-avatars")
        .upload(path, new Blob(["probe"], { type: "text/plain" }), {
          upsert: true,
          contentType: "text/plain",
        });
      expectFail("member cannot upload avatar under other org path", error, results);
      if (!error) {
        await admin.storage.from("person-avatars").remove([path]);
      }
    }

    // Disabled org: member loses project visibility via current_org_id()
    {
      const { error: disableErr } = await admin
        .from("organizations")
        .update({ disabled_at: new Date().toISOString() })
        .eq("id", orgAId);
      if (disableErr) {
        results.push({
          name: "disable org A",
          ok: false,
          detail: disableErr.message,
        });
      } else {
        // Refresh session so JWT-backed helpers re-read org state
        await member.auth.refreshSession();
        const { data, error } = await member.from("projects").select("id");
        results.push({
          name: "disabled org hides projects from member",
          ok: !error && (data?.length ?? 0) === 0,
          detail:
            error?.message ??
            (data?.length ? `still saw ${data.length} project(s)` : undefined),
        });
        await admin
          .from("organizations")
          .update({ disabled_at: null })
          .eq("id", orgAId);
      }
    }
  } finally {
    if (KEEP) {
      console.log("SECURITY_RLS_KEEP=1 — skipping cleanup");
    } else {
      // Best-effort cleanup
      await admin.from("organizations").delete().in("id", orgIds);
      for (const id of userIds) {
        await admin.auth.admin.deleteUser(id);
      }
    }
  }

  console.log("");
  let failed = 0;
  for (const r of results) {
    const mark = r.ok ? "PASS" : "FAIL";
    if (!r.ok) failed += 1;
    console.log(`${mark}  ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  }
  console.log("");
  if (failed > 0) {
    console.error(`security-rls-suite: ${failed}/${results.length} failed`);
    process.exit(1);
  }
  if (results.length === 0) {
    console.error("security-rls-suite: no checks ran");
    process.exit(1);
  }
  console.log(`security-rls-suite: ok (${results.length} checks)`);
}

main().catch((err) => {
  console.error("security-rls-suite: fatal", err instanceof Error ? err.message : err);
  process.exit(1);
});
