import { NextResponse } from "next/server";
import { requireAuthApiAccess } from "@/lib/api/require-auth";
import { deleteAttachmentsForEntity } from "@/lib/storage/entity-cleanup";
import type { AttachmentEntityType } from "@/lib/storage/types";
import { isR2Configured } from "@/lib/storage";

type Body = {
  entityType?: AttachmentEntityType;
  entityId?: string;
};

export async function POST(request: Request) {
  const auth = await requireAuthApiAccess(request);
  if ("error" in auth) return auth.error;

  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "R2 storage is not configured" },
      { status: 503 },
    );
  }

  const body = (await request.json()) as Body;
  const entityType = body.entityType;
  const entityId = body.entityId?.trim();

  if (
    entityType !== "profile_picture" &&
    entityType !== "comment" &&
    entityType !== "task_note"
  ) {
    return NextResponse.json({ error: "Invalid entityType" }, { status: 400 });
  }
  if (!entityId) {
    return NextResponse.json({ error: "entityId required" }, { status: 400 });
  }

  const deleted = await deleteAttachmentsForEntity(auth.admin, {
    organizationId: auth.caller.organization_id,
    entityType,
    entityId,
  });

  return NextResponse.json({ ok: true, deleted });
}
