import { NextResponse } from "next/server";
import { requireManagerApiAccess } from "@/lib/api/require-manager";
import {
  createOrganizationInvite,
  type InviteDelivery,
} from "@/lib/accounts/invites";
import type { Role } from "@/lib/types";

export async function GET(request: Request) {
  const auth = await requireManagerApiAccess(request, {
    roleError: "Only admins and managers can view invites",
  });
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.admin
    .from("organization_invites")
    .select(
      "id, email, role, full_name, person_id, expires_at, accepted_at, revoked_at, created_at",
    )
    .eq("organization_id", auth.caller.organization_id)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ invites: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireManagerApiAccess(request, {
    roleError: "Only admins and managers can invite",
  });
  if ("error" in auth) return auth.error;

  const body = (await request.json()) as {
    email?: string;
    role?: string;
    fullName?: string;
    personId?: string;
    delivery?: string;
  };

  const role: Role =
    body.role === "admin" || body.role === "manager" ? body.role : "member";
  if (role === "admin" && auth.caller.role !== "admin") {
    return NextResponse.json(
      { error: "Only admins can invite other admins" },
      { status: 403 },
    );
  }

  const delivery: InviteDelivery =
    body.delivery === "link" ? "link" : "email";

  try {
    const result = await createOrganizationInvite(auth.admin, {
      organizationId: auth.caller.organization_id,
      email: body.email ?? "",
      role,
      fullName: body.fullName,
      personId: body.personId,
      invitedBy: auth.caller.id,
      delivery,
      origin: auth.origin,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invite failed" },
      { status: 400 },
    );
  }
}
