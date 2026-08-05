export type StorageProviderName = "r2";

export type AttachmentEntityType =
  | "profile_picture"
  | "comment"
  | "task_note";

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
  created_at: string;
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
