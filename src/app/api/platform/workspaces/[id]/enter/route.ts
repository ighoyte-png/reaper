import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  const auth = await requirePlatformAdmin();
  if ("error" in auth && auth.error) return auth.error;
  const { admin, user, email } = auth;
  const { id } = await ctx.params;

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .select("id, name, slug, disabled_at")
    .eq("id", id)
    .maybeSingle();

  if (orgError || !org) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  const fullName =
    (user.user_metadata?.full_name as string | undefined)?.trim() ||
    email.split("@")[0] ||
    "Platform admin";

  if (existing) {
    const { error } = await admin
      .from("profiles")
      .update({
        organization_id: id,
        role: "admin",
        email,
        full_name: fullName,
      })
      .eq("id", user.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await admin.from("profiles").insert({
      id: user.id,
      organization_id: id,
      email,
      full_name: fullName,
      role: "admin",
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    workspace: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      disabled_at: org.disabled_at,
    },
  });
}
