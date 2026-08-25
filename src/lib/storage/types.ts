export type StorageProviderName = "r2";

export type AttachmentEntityType =
  | "profile_picture"
  | "comment"
  | "task_note"
  | "custom_emoji";

/** inline = embedded in WYSIWYG HTML; attached = email-style file chip. */
export type AttachmentPlacement = "inline" | "attached";

export type AttachmentRecord = {
  id: string;
  organization_id: string;
  uploaded_by_profile_id: string | null;
  entity_type: AttachmentEntityType;
  entity_id: string;
  storage_provider: StorageProviderName;
  bucket: string;
  storage_key: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  ready: boolean;
  placement: AttachmentPlacement;
  created_at: string;
};

export type EntityFileAttachment = {
  id: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
};

export type PresignedUpload = {
  uploadUrl: string;
  headers: Record<string, string>;
  expiresIn: number;
};

export type StorageHeadResult = {
  exists: boolean;
  contentLength?: number;
  contentType?: string;
};
