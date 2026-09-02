import type { AttachmentEntityType } from "@/lib/storage/types";

function sanitizeExt(ext: string): string {
  const e = ext.replace(/^\./, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return e || "bin";
}

export function buildStorageKey(
  entityType: AttachmentEntityType,
  entityId: string,
  extension: string,
  objectId: string = crypto.randomUUID(),
): string {
  const ext = sanitizeExt(extension);
  const id = entityId.replace(/[^a-zA-Z0-9_-]/g, "");
  switch (entityType) {
    case "profile_picture":
      return `profile-pictures/${id}/${objectId}.${ext}`;
    case "comment":
      return `comments/${id}/${objectId}.${ext}`;
    case "task_note":
      return `notes/${id}/${objectId}.${ext}`;
    case "custom_emoji":
      return `emojis/${id}/${objectId}.${ext}`;
    case "org_branding":
      return `org-branding/${id}/${objectId}.${ext}`;
    default: {
      const _exhaustive: never = entityType;
      return _exhaustive;
    }
  }
}

export function sanitizeOriginalFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "file";
  return base.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 180) || "file";
}
