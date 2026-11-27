import { NextResponse } from "next/server";
import { requireManagerApiAccess } from "@/lib/api/require-manager";
import { getAccountEntitlements } from "@/lib/accounts/entitlements";

/** Seat usage for the active workspace (managers+). */
export async function GET(request: Request) {
  const auth = await requireManagerApiAccess(request, {
    roleError: "Only admins and managers can view seat usage",
  });
  if ("error" in auth) return auth.error;

  try {
    const entitlements = await getAccountEntitlements(
      auth.admin,
      auth.caller.organization_id,
    );
    return NextResponse.json({ entitlements });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not load entitlements" },
      { status: 500 },
    );
  }
}
