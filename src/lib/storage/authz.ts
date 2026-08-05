import {
  DEFAULT_MAX_DOCUMENT_BYTES,
  DEFAULT_MAX_IMAGE_BYTES,
} from "@/lib/storage/config";
import type { AttachmentEntityType } from "@/lib/storage/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const rateBucket = new Map<string, { count: number; resetAt: number }>();

/** Simple in-memory rate limit (best-effort on serverless). */
export function checkStorageRateLimit(
  profileId: string,
  limit = 40,
  windowMs = 60_000,
): boolean {
  const now = Date.now();
  const cur = rateBucket.get(profileId);
  if (!cur || cur.resetAt <= now) {
    rateBucket.set(profileId, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (cur.count >= limit) return false;
  cur.count += 1;
  return true;
}

export async function readStorageLimits(admin: SupabaseClient): Promise<{
  maxImageBytes: number;
  maxDocumentBytes: number;
}> {
  try {
    const { data } = await admin
      .from("app_settings")
      .select("max_image_bytes, max_document_bytes")
      .eq("id", 1)
      .maybeSingle();
    return {
      maxImageBytes:
        typeof data?.max_image_bytes === "number" && data.max_image_bytes > 0
          ? data.max_image_bytes
          : DEFAULT_MAX_IMAGE_BYTES,
      maxDocumentBytes:
        typeof data?.max_document_bytes === "number" &&
        data.max_document_bytes > 0
          ? data.max_document_bytes
          : DEFAULT_MAX_DOCUMENT_BYTES,
    };
  } catch {
    return {
      maxImageBytes: DEFAULT_MAX_IMAGE_BYTES,
      maxDocumentBytes: DEFAULT_MAX_DOCUMENT_BYTES,
    };
  }
}

/**
 * Authorize that the caller may attach files to the entity.
 * Uses service-role client for lookups.
 */
export async function assertCanAttachToEntity(
  admin: SupabaseClient,
  opts: {
    organizationId: string;
    profileId: string;
    role: string;
    entityType: AttachmentEntityType;
    entityId: string;
  },
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { organizationId, profileId, role, entityType, entityId } = opts;

  if (entityType === "profile_picture") {
    const { data: person } = await admin
      .from("people")
      .select("id, organization_id, profile_id")
      .eq("id", entityId)
      .maybeSingle();
    if (!person || person.organization_id !== organizationId) {
      return { ok: false, status: 404, error: "Person not found" };
    }
    const isSelf = person.profile_id === profileId;
    const isMgr = role === "admin" || role === "manager";
    if (!isSelf && !isMgr) {
      return { ok: false, status: 403, error: "Not allowed to update this avatar" };
    }
    return { ok: true };
  }

  if (entityType === "task_note") {
    // Task may not exist yet (client-generated id while creating/editing draft).
    const { data: task } = await admin
      .from("tasks")
      .select("id, organization_id, project_id")
      .eq("id", entityId)
      .maybeSingle();
    if (task) {
      if (task.organization_id !== organizationId) {
        return { ok: false, status: 404, error: "Task not found" };
      }
      return { ok: true };
    }
    // Draft task id: allow if caller is in org (bind on save).
    return { ok: true };
  }

  if (entityType === "comment") {
    // Comment may not exist yet (client-generated id for draft uploads).
    const { data: comment } = await admin
      .from("task_comments")
      .select("id, organization_id, task_id")
      .eq("id", entityId)
      .maybeSingle();
    if (comment) {
      if (comment.organization_id !== organizationId) {
        return { ok: false, status: 404, error: "Comment not found" };
      }
      return { ok: true };
    }
    // Draft comment id: allow if caller is in org (bind on save).
    return { ok: true };
  }

  return { ok: false, status: 400, error: "Invalid entity type" };
}

export async function assertCanReadAttachment(
  admin: SupabaseClient,
  opts: {
    organizationId: string;
    attachmentOrgId: string;
  },
): Promise<boolean> {
  return opts.organizationId === opts.attachmentOrgId;
}
