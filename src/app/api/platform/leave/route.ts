import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { writePlatformAudit } from "@/lib/accounts/audit";

/**
 * Detach the signed-in platform operator from all workspace memberships
 * (and clear active org) so they return to platform-only mode (/admin).
 *
 * Does not delete customer orgs. Sole-owned leftover orgs the operator owns
 * are left in place unless empty of other members — those get deleted.
 */
export async function POST() {
  const auth = await requirePlatformAdmin();
  if ("error" in auth && auth.error) return auth.error;
  const { admin, user, email } = auth;

  const { data: mems, error: memErr } = await admin
    .from("organization_memberships")
    .select("organization_id, is_owner")
    .eq("user_id", user.id);
  if (memErr) {
    return NextResponse.json({ error: memErr.message }, { status: 500 });
  }

  const left: { id: string; slug: string | null; deletedOrg?: boolean }[] = [];

  for (const m of mems ?? []) {
    const orgId = String(m.organization_id);
    const { data: org } = await admin
      .from("organizations")
      .select("id, slug, owner_user_id")
      .eq("id", orgId)
      .maybeSingle();
    if (!org) continue;

    const { count: memberCount } = await admin
      .from("organization_memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    const sole = (memberCount ?? 0) <= 1;
    const owns = org.owner_user_id === user.id;

    if (owns && sole) {
      const { error } = await admin.from("organizations").delete().eq("id", orgId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      left.push({ id: orgId, slug: org.slug, deletedOrg: true });
      continue;
    }

    if (owns && !sole) {
      const { data: others } = await admin
        .from("organization_memberships")
        .select("user_id, role, is_owner")
        .eq("organization_id", orgId)
        .neq("user_id", user.id);
      const next =
        (others ?? []).find((o) => o.is_owner) ||
        (others ?? []).find((o) => o.role === "admin") ||
        (others ?? [])[0];
      if (!next) {
        return NextResponse.json(
          { error: `No successor owner for ${org.slug}` },
          { status: 400 },
        );
      }
      await admin
        .from("organizations")
        .update({ owner_user_id: next.user_id })
        .eq("id", orgId);
      await admin
        .from("organization_memberships")
        .update({ is_owner: true, role: "admin" })
        .eq("organization_id", orgId)
        .eq("user_id", next.user_id);
    }

    const { error: delErr } = await admin
      .from("organization_memberships")
      .delete()
      .eq("user_id", user.id)
      .eq("organization_id", orgId);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
    left.push({ id: orgId, slug: org.slug });
  }

  await admin.from("user_active_organization").delete().eq("user_id", user.id);
  await admin.from("profiles").update({ organization_id: null }).eq("id", user.id);

  await writePlatformAudit(admin, {
    actorUserId: user.id,
    actorEmail: email,
    action: "platform.leave_workspaces",
    meta: { left },
  });

  return NextResponse.json({ ok: true, left });
}
