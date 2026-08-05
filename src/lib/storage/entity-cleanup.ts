import type { SupabaseClient } from "@supabase/supabase-js";
import { getStorageProvider, isR2Configured } from "@/lib/storage";
import type { AttachmentEntityType } from "@/lib/storage/types";

async function deleteAttachmentRows(
  admin: SupabaseClient,
  rows: { id: string; storage_key: string; entity_type?: string }[],
): Promise<number> {
  if (!rows.length) return 0;

  if (isR2Configured()) {
    const storage = getStorageProvider();
    for (const row of rows) {
      try {
        await storage.deleteObject(row.storage_key);
      } catch (err) {
        console.warn("R2 delete failed during attachment cleanup", err);
      }
    }
  }

  for (const row of rows) {
    if (row.entity_type === "profile_picture") {
      await admin
        .from("people")
        .update({ avatar_attachment_id: null })
        .eq("avatar_attachment_id", row.id);
    }
  }

  const ids = rows.map((r) => r.id);
  const { error: delError } = await admin
    .from("attachments")
    .delete()
    .in("id", ids);
  if (delError) throw delError;
  return ids.length;
}

/** Delete all ready/pending attachment rows and R2 objects for an entity. */
export async function deleteAttachmentsForEntity(
  admin: SupabaseClient,
  opts: {
    organizationId: string;
    entityType: AttachmentEntityType;
    entityId: string;
  },
): Promise<number> {
  const { data: rows, error } = await admin
    .from("attachments")
    .select("id, storage_key, entity_type")
    .eq("organization_id", opts.organizationId)
    .eq("entity_type", opts.entityType)
    .eq("entity_id", opts.entityId);

  if (error) throw error;
  if (!rows?.length) return 0;

  return deleteAttachmentRows(
    admin,
    rows.map((row) => ({
      id: row.id as string,
      storage_key: row.storage_key as string,
      entity_type: row.entity_type as string,
    })),
  );
}

/**
 * Delete inline (WYSIWYG) attachments for an entity that are no longer
 * referenced in the saved HTML. Email-style `attached` rows are untouched.
 */
export async function pruneInlineAttachments(
  admin: SupabaseClient,
  opts: {
    organizationId: string;
    entityType: AttachmentEntityType;
    entityId: string;
    keepIds: string[];
  },
): Promise<number> {
  const keep = new Set(
    opts.keepIds
      .map((id) => id.trim().toLowerCase())
      .filter((id) => /^[0-9a-f-]{36}$/.test(id)),
  );

  const { data: rows, error } = await admin
    .from("attachments")
    .select("id, storage_key")
    .eq("organization_id", opts.organizationId)
    .eq("entity_type", opts.entityType)
    .eq("entity_id", opts.entityId)
    .eq("placement", "inline");

  if (error) throw error;
  if (!rows?.length) return 0;

  const toDelete = rows.filter(
    (row) => !keep.has(String(row.id).toLowerCase()),
  );
  if (!toDelete.length) return 0;

  return deleteAttachmentRows(
    admin,
    toDelete.map((row) => ({
      id: row.id as string,
      storage_key: row.storage_key as string,
    })),
  );
}
