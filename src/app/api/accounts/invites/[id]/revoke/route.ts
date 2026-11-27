import { NextResponse } from "next/server";
import { requireManagerApiAccess } from "@/lib/api/require-manager";
import { revokeOrganizationInvite } from "@/lib/accounts/invites";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireManagerApiAccess(request, {
    roleError: "Only admins and managers can revoke invites",
  });
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  try {
    await revokeOrganizationInvite(
      auth.admin,
      id,
      auth.caller.organization_id,
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Revoke failed" },
      { status: 400 },
    );
  }
}
