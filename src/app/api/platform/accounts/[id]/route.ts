import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { writePlatformAudit } from "@/lib/accounts/audit";
import { getAccountEntitlements } from "@/lib/accounts/entitlements";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requirePlatformAdmin();
  if ("error" in auth && auth.error) return auth.error;
  const { admin } = auth;
  const { id } = await ctx.params;

  const { data: org, error } = await admin
    .from("organizations")
    .select("id, name, slug, disabled_at, created_at, owner_user_id")
    .eq("id", id)
    .maybeSingle();
  if (error || !org) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const [
    { data: memberships },
    { data: invites },
    { data: audit },
    entitlements,
  ] = await Promise.all([
    admin
      .from("organization_memberships")
      .select("user_id, role, is_owner, created_at")
      .eq("organization_id", id)
      .order("created_at", { ascending: true }),
    admin
      .from("organization_invites")
      .select(
        "id, email, role, full_name, expires_at, accepted_at, revoked_at, created_at",
      )
      .eq("organization_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("platform_audit_log")
      .select(
        "id, actor_email, action, target_type, target_id, meta, created_at",
      )
      .eq("organization_id", id)
      .order("created_at", { ascending: false })
      .limit(40),
    getAccountEntitlements(admin, id),
  ]);

  const userIds = (memberships ?? []).map((m) => String(m.user_id));
  const profileById = new Map<
    string,
    { email: string; full_name: string }
  >();
  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email, full_name")
      .in("id", userIds);
    for (const p of profiles ?? []) {
      profileById.set(String(p.id), {
        email: String(p.email ?? ""),
        full_name: String(p.full_name ?? ""),
      });
    }
  }

  return NextResponse.json({
    account: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      disabled_at: org.disabled_at,
      created_at: org.created_at,
      owner_user_id: org.owner_user_id,
    },
    entitlements,
    members: (memberships ?? []).map((m) => {
      const profile = profileById.get(String(m.user_id));
      return {
        user_id: m.user_id,
        role: m.role,
        is_owner: Boolean(m.is_owner),
        created_at: m.created_at,
        email: profile?.email ?? "",
        full_name: profile?.full_name ?? "",
      };
    }),
    invites: invites ?? [],
    audit: audit ?? [],
  });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requirePlatformAdmin();
  if ("error" in auth && auth.error) return auth.error;
  const { admin, user, email } = auth;
  const { id } = await ctx.params;

  const body = (await request.json()) as {
    name?: string;
    disabled?: boolean;
    plan_key?: string;
    billing_status?: string;
    seat_limit?: number | null;
  };

  const orgPatch: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json({ error: "Name required" }, { status: 400 });
    }
    orgPatch.name = name;
  }
  if (typeof body.disabled === "boolean") {
    orgPatch.disabled_at = body.disabled ? new Date().toISOString() : null;
  }

  if (Object.keys(orgPatch).length > 0) {
    const { error } = await admin
      .from("organizations")
      .update(orgPatch)
      .eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const billingPatch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  let billingTouched = false;
  if (typeof body.plan_key === "string" && body.plan_key.trim()) {
    billingPatch.plan_key = body.plan_key.trim();
    billingTouched = true;
  }
  if (
    typeof body.billing_status === "string" &&
    ["none", "trialing", "active", "past_due", "canceled"].includes(
      body.billing_status,
    )
  ) {
    billingPatch.status = body.billing_status;
    billingTouched = true;
  }
  if (body.seat_limit === null) {
    billingPatch.seat_limit = null;
    billingTouched = true;
  } else if (typeof body.seat_limit === "number" && body.seat_limit >= 0) {
    billingPatch.seat_limit = Math.floor(body.seat_limit);
    billingTouched = true;
  }

  if (billingTouched) {
    const { error } = await admin.from("billing_accounts").upsert(
      {
        organization_id: id,
        ...billingPatch,
      },
      { onConflict: "organization_id" },
    );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (Object.keys(orgPatch).length === 0 && !billingTouched) {
    return NextResponse.json({ error: "No changes" }, { status: 400 });
  }

  await writePlatformAudit(admin, {
    actorUserId: user.id,
    actorEmail: email,
    action: "account.update",
    organizationId: id,
    targetType: "organization",
    targetId: id,
    meta: { ...orgPatch, billing: billingTouched ? billingPatch : undefined },
  });

  const { data } = await admin
    .from("organizations")
    .select("id, name, slug, disabled_at, created_at, owner_user_id")
    .eq("id", id)
    .maybeSingle();

  return NextResponse.json({ account: data });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requirePlatformAdmin();
  if ("error" in auth && auth.error) return auth.error;
  const { admin, user, email } = auth;
  const { id } = await ctx.params;

  const body = (await request.json().catch(() => ({}))) as {
    confirmSlug?: string;
  };

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .select("id, slug")
    .eq("id", id)
    .maybeSingle();

  if (orgError || !org) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  if (
    !body.confirmSlug ||
    body.confirmSlug.trim() !== String(org.slug ?? "")
  ) {
    return NextResponse.json(
      { error: "Type the account slug to confirm delete" },
      { status: 400 },
    );
  }

  const { data: active } = await admin
    .from("user_active_organization")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (active?.organization_id === id) {
    return NextResponse.json(
      {
        error:
          "Cannot delete the account you are currently in. Enter another account first.",
      },
      { status: 400 },
    );
  }

  const { error } = await admin.from("organizations").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writePlatformAudit(admin, {
    actorUserId: user.id,
    actorEmail: email,
    action: "account.delete",
    targetType: "organization",
    targetId: id,
    meta: { slug: org.slug },
  });

  return NextResponse.json({ ok: true });
}
