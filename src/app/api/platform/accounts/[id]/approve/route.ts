import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { approveAccount } from "@/lib/accounts/approval";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  const auth = await requirePlatformAdmin();
  if ("error" in auth && auth.error) return auth.error;
  const { admin, user, email } = auth;
  const { id } = await ctx.params;

  const { data: org, error } = await admin
    .from("organizations")
    .select("id, approval_status")
    .eq("id", id)
    .maybeSingle();
  if (error || !org) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  try {
    await approveAccount(admin, {
      orgId: id,
      actorUserId: user.id,
      actorEmail: email,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Approve failed" },
      { status: 500 },
    );
  }

  const { data } = await admin
    .from("organizations")
    .select(
      "id, name, slug, disabled_at, created_at, owner_user_id, approval_status, approved_at, rejection_reason",
    )
    .eq("id", id)
    .maybeSingle();

  return NextResponse.json({ account: data });
}
