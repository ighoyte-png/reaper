import { NextResponse } from "next/server";
import { requireAuthApiAccess } from "@/lib/api/require-auth";
import { assertCanAttachToEntity } from "@/lib/storage/authz";
import { pruneInlineAttachments } from "@/lib/storage/entity-cleanup";
import { isR2Configured } from "@/lib/storage";
import type { AttachmentEntityType } from "@/lib/storage/types";

type Body = {
  entityType?: AttachmentEntityType;
  entityId?: string;
  keepAttachmentIds?: string[];
};

/**
 * POST /api/storage/sync-inline
 * Deletes inline R2 attachments for an entity that are no longer in saved HTML.
 */
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
  const keepAttachmentIds = Array.isArray(body.keepAttachmentIds)
    ? body.keepAttachmentIds.filter((id): id is string => typeof id === "string")
    : [];

  if (entityType !== "comment" && entityType !== "task_note") {
    return NextResponse.json({ error: "Invalid entityType" }, { status: 400 });
  }
  if (!entityId) {
    return NextResponse.json({ error: "entityId required" }, { status: 400 });
  }

  const authz = await assertCanAttachToEntity(auth.admin, {
    organizationId: auth.caller.organization_id,
    profileId: auth.caller.id,
    role: auth.caller.role,
    entityType,
    entityId,
  });
  if (!authz.ok) {
    return NextResponse.json(
      { error: authz.error },
      { status: authz.status },
    );
  }

  const deleted = await pruneInlineAttachments(auth.admin, {
    organizationId: auth.caller.organization_id,
    entityType,
    entityId,
    keepIds: keepAttachmentIds,
  });

  return NextResponse.json({ ok: true, deleted });
}
