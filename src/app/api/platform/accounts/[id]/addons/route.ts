import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { writePlatformAudit } from "@/lib/accounts/audit";
import {
  KNOWN_ADDON_KEYS,
  listAddonAllowlist,
  setAddonAllowlist,
} from "@/lib/accounts/addons";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requirePlatformAdmin();
  if ("error" in auth && auth.error) return auth.error;
  const { admin } = auth;
  const { id } = await ctx.params;

  const { data: org } = await admin
    .from("organizations")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!org) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const rows = await listAddonAllowlist(admin, id);
  const byKey = new Map(rows.map((r) => [r.addon_key, r.allowed]));
  return NextResponse.json({
    addons: KNOWN_ADDON_KEYS.map((key) => ({
      addon_key: key,
      allowed: byKey.get(key) === true,
    })),
  });
}

export async function PUT(request: Request, ctx: Ctx) {
  const auth = await requirePlatformAdmin();
  if ("error" in auth && auth.error) return auth.error;
  const { admin, user, email } = auth;
  const { id } = await ctx.params;

  const { data: org } = await admin
    .from("organizations")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!org) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const body = (await request.json()) as {
    addons?: { addon_key: string; allowed: boolean }[];
  };
  if (!Array.isArray(body.addons)) {
    return NextResponse.json({ error: "addons required" }, { status: 400 });
  }

  const known = new Set<string>(KNOWN_ADDON_KEYS);
  const entries = body.addons
    .map((a) => ({
      addon_key: String(a.addon_key ?? "")
        .trim()
        .toLowerCase(),
      allowed: Boolean(a.allowed),
    }))
    .filter((a) => known.has(a.addon_key));

  try {
    await setAddonAllowlist(admin, id, entries);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Update failed" },
      { status: 500 },
    );
  }

  await writePlatformAudit(admin, {
    actorUserId: user.id,
    actorEmail: email,
    action: "account.addons.update",
    organizationId: id,
    targetType: "organization",
    targetId: id,
    meta: { addons: entries },
  });

  const rows = await listAddonAllowlist(admin, id);
  const byKey = new Map(rows.map((r) => [r.addon_key, r.allowed]));
  return NextResponse.json({
    addons: KNOWN_ADDON_KEYS.map((key) => ({
      addon_key: key,
      allowed: byKey.get(key) === true,
    })),
  });
}
