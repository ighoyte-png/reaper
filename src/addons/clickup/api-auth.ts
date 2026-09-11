import { isAdmin, canManage } from "@/lib/auth/roles";
import { requireManagerApiAccess } from "@/lib/api/require-manager";
import { NextResponse } from "next/server";
import type { ManagerApiResult } from "@/lib/api/require-manager";

export async function requireClickUpAdminApi(
  request: Request,
): Promise<ManagerApiResult> {
  const auth = await requireManagerApiAccess(request, {
    roleError: "Only workspace admins can manage the ClickUp addon",
  });
  if ("error" in auth) return auth;
  if (!isAdmin(auth.caller.role)) {
    return {
      error: NextResponse.json(
        { error: "Only workspace admins can manage the ClickUp addon" },
        { status: 403 },
      ),
    };
  }
  return auth;
}

export async function requireClickUpManagerApi(
  request: Request,
): Promise<ManagerApiResult> {
  const auth = await requireManagerApiAccess(request, {
    roleError: "Only admins and managers can sync projects to ClickUp",
  });
  if ("error" in auth) return auth;
  if (!canManage(auth.caller.role)) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return auth;
}
