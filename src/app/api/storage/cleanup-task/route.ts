import { NextResponse } from "next/server";
import { requireAuthApiAccess } from "@/lib/api/require-auth";
import { assertCanAttachToEntity } from "@/lib/storage/authz";
import { deleteAttachmentsForTaskTree } from "@/lib/storage/entity-cleanup";

type Body = {
  taskId?: string;
};

/**
 * POST /api/storage/cleanup-task
 * Deletes R2 objects + attachment rows for a task, its subtasks, and all
 * their comments. Prefer calling this before deleting the task row.
 */
export async function POST(request: Request) {
  const auth = await requireAuthApiAccess(request);
  if ("error" in auth) return auth.error;

  const body = (await request.json()) as Body;
  const taskId = body.taskId?.trim();
  if (!taskId) {
    return NextResponse.json({ error: "taskId required" }, { status: 400 });
  }

  const authz = await assertCanAttachToEntity(auth.admin, {
    organizationId: auth.caller.organization_id,
    profileId: auth.caller.id,
    role: auth.caller.role,
    entityType: "task_note",
    entityId: taskId,
  });
  if (!authz.ok) {
    // Task already gone: still allow org members to sweep leftovers.
    if (authz.status !== 404) {
      return NextResponse.json(
        { error: authz.error },
        { status: authz.status },
      );
    }
  }

  const deleted = await deleteAttachmentsForTaskTree(auth.admin, {
    organizationId: auth.caller.organization_id,
    taskId,
  });

  return NextResponse.json({ ok: true, deleted });
}
