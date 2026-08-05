import { isR2Configured } from "@/lib/storage/config";
export { isR2Configured, getR2Config } from "@/lib/storage/config";
export {
  DEFAULT_MAX_DOCUMENT_BYTES,
  DEFAULT_MAX_IMAGE_BYTES,
  DEFAULT_SIGNED_URL_TTL,
} from "@/lib/storage/config";
export { buildStorageKey, sanitizeOriginalFilename } from "@/lib/storage/keys";
export {
  sniffMimeFromMagic,
  validateUploadFile,
  type FileKind,
  type ValidateFileInput,
  type ValidateFileResult,
} from "@/lib/storage/validate";
export type {
  AttachmentEntityType,
  AttachmentRecord,
  PresignedUpload,
  StorageHeadResult,
  StorageProviderName,
} from "@/lib/storage/types";
export { deleteAttachmentsForEntity, deleteAttachmentsForTaskTree, pruneInlineAttachments } from "@/lib/storage/entity-cleanup";
export type { StorageProvider } from "@/lib/storage/provider";

import { createR2StorageProvider } from "@/lib/storage/r2";
import type { StorageProvider } from "@/lib/storage/provider";

/** Central facade — only entry point for app code to touch object storage. */
export function getStorageProvider(): StorageProvider {
  if (!isR2Configured()) {
    throw new Error("R2 storage is not configured");
  }
  return createR2StorageProvider();
}
