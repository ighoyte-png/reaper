import { NextResponse } from "next/server";
import { requireAuthApiAccess } from "@/lib/api/require-auth";
import {
  dedupeProfileIds,
  type EmitNotificationInput,
  type NotificationKind,
} from "@/lib/domain/notifications";
import { emitAndPushNotifications } from "@/lib/server/notifications";

export async function POST(request: Request) {
  const auth = await requireAuthApiAccess(request);
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as Partial<EmitNotificationInput> & {
    kind?: string;
  };
  if (!b.organizationId || b.organizationId !== auth.caller.organization_id) {
    return NextResponse.json({ error: "Invalid organization" }, { status: 403 });
  }
  if (!b.kind || !b.title) {
    return NextResponse.json({ error: "kind and title required" }, { status: 400 });
  }

  const recipients = dedupeProfileIds(b.recipientProfileIds ?? []).filter(
    (id) => id !== auth.userId,
  );
  if (recipients.length === 0) {
    return NextResponse.json({ ids: [], sent: 0, failed: 0 });
  }

  const input: EmitNotificationInput = {
    organizationId: b.organizationId,
    recipientProfileIds: recipients,
    kind: b.kind as NotificationKind,
    title: b.title,
    body: b.body ?? "",
    href: b.href ?? "/",
    entityType: b.entityType ?? null,
    entityId: b.entityId ?? null,
    actorPersonId: b.actorPersonId ?? null,
  };

  const result = await emitAndPushNotifications(input);
  return NextResponse.json(result);
}
