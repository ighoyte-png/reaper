import { NextResponse } from "next/server";
import { pruneCommentsDeletedInClickUpForReaperTask } from "@/addons/clickup/inbound";
import { requireAuthApiAccess } from "@/lib/api/require-auth";

export const runtime = "nodejs";

/**
 * Opportunistic CU→Reaper comment prune for one task.
 * ClickUp does not emit a comment-deleted webhook, so we reconcile when a
 * thread is opened (or any other client asks).
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAuthApiAccess(request);
    if ("error" in auth) return auth.error;

    const body = (await request.json().catch(() => ({}))) as {
      task_id?: string;
    };
    const taskId = body.task_id?.trim();
    if (!taskId) {
      return NextResponse.json({ error: "task_id required" }, { status: 400 });
    }

    const removed = await pruneCommentsDeletedInClickUpForReaperTask({
      admin: auth.admin,
      orgId: auth.caller.organization_id,
      reaperTaskId: taskId,
    });
    return NextResponse.json({ ok: true, removed });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
