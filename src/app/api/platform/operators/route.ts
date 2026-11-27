import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import {
  grantPlatformOperator,
  listPlatformOperators,
  revokePlatformOperator,
} from "@/lib/accounts/operators";

export async function GET() {
  const auth = await requirePlatformAdmin();
  if ("error" in auth && auth.error) return auth.error;
  try {
    const operators = await listPlatformOperators(auth.admin);
    return NextResponse.json({ operators });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requirePlatformAdmin();
  if ("error" in auth && auth.error) return auth.error;
  const body = (await request.json()) as { email?: string };
  try {
    const result = await grantPlatformOperator(auth.admin, {
      email: body.email ?? "",
      grantedByUserId: auth.user.id,
      grantedByEmail: auth.email,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await requirePlatformAdmin();
  if ("error" in auth && auth.error) return auth.error;
  const body = (await request.json()) as { userId?: string };
  if (!body.userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }
  try {
    await revokePlatformOperator(auth.admin, {
      userId: body.userId,
      actorUserId: auth.user.id,
      actorEmail: auth.email,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 400 },
    );
  }
}
