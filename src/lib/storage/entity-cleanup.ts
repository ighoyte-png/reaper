import type { SupabaseClient } from "@supabase/supabase-js";
import { getStorageProvider, isR2Configured } from "@/lib/storage";
import type { AttachmentEntityType } from "@/lib/storage/types";

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

  if (isR2Configured()) {
    const storage = getStorageProvider();
    for (const row of rows) {
      try {
        await storage.deleteObject(row.storage_key as string);
      } catch (err) {
        console.warn("R2 delete failed during entity cleanup", err);
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

  const ids = rows.map((r) => r.id as string);
  const { error: delError } = await admin
    .from("attachments")
    .delete()
    .in("id", ids);
  if (delError) throw delError;
  return ids.length;
}
