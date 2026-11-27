import { NextResponse } from "next/server";
import { requireManagerApiAccess } from "@/lib/api/require-manager";
import {
  resendOrganizationInvite,
  type InviteDelivery,
} from "@/lib/accounts/invites";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireManagerApiAccess(request, {
    roleError: "Only admins and managers can resend invites",
  });
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    delivery?: string;
  };
  const delivery: InviteDelivery =
    body.delivery === "link" ? "link" : "email";

  try {
    const result = await resendOrganizationInvite(
      auth.admin,
      id,
      auth.caller.organization_id,
      auth.caller.id,
      auth.origin,
      delivery,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Resend failed" },
      { status: 400 },
    );
  }
}
