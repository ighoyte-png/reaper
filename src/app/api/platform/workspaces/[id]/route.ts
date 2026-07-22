import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requirePlatformAdmin();
  if ("error" in auth && auth.error) return auth.error;
  const { admin } = auth;
  const { id } = await ctx.params;

  const body = (await request.json()) as {
    name?: string;
    disabled?: boolean;
  };

  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json({ error: "Name required" }, { status: 400 });
    }
    patch.name = name;
  }
  if (typeof body.disabled === "boolean") {
    patch.disabled_at = body.disabled ? new Date().toISOString() : null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No changes" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("organizations")
    .update(patch)
    .eq("id", id)
    .select("id, name, slug, disabled_at, created_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  return NextResponse.json({ workspace: data });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requirePlatformAdmin();
  if ("error" in auth && auth.error) return auth.error;
  const { admin, user } = auth;
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
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  if (
    !body.confirmSlug ||
    body.confirmSlug.trim() !== String(org.slug ?? "")
  ) {
    return NextResponse.json(
      { error: "Type the workspace slug to confirm delete" },
      { status: 400 },
    );
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.organization_id === id) {
    return NextResponse.json(
      {
        error:
          "Cannot delete the workspace you are currently in. Enter another workspace first.",
      },
      { status: 400 },
    );
  }

  const { error } = await admin.from("organizations").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
