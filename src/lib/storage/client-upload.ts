import type {
  AttachmentEntityType,
  AttachmentPlacement,
  EntityFileAttachment,
} from "@/lib/storage/types";

async function readMagicBase64(file: File): Promise<string | undefined> {
  const slice = file.slice(0, 32);
  const buf = new Uint8Array(await slice.arrayBuffer());
  if (buf.length === 0) return undefined;
  let binary = "";
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]!);
  return btoa(binary);
}

export type ClientUploadResult = {
  attachmentId: string;
  mimeType: string;
  originalFilename: string;
  sizeBytes: number;
};

/** Presign → PUT to R2 → complete. Browser-only. */
export async function uploadFileToR2(input: {
  file: File;
  entityType: AttachmentEntityType;
  entityId: string;
  imagesOnly?: boolean;
  placement?: AttachmentPlacement;
  onProgress?: (pct: number) => void;
}): Promise<ClientUploadResult> {
  const magicBase64 = await readMagicBase64(input.file);
  const filename = input.file.name || "upload";
  const presignRes = await fetch("/api/storage/presign-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entityType: input.entityType,
      entityId: input.entityId,
      filename,
      mimeType: input.file.type || "application/octet-stream",
      sizeBytes: input.file.size,
      magicBase64,
      imagesOnly: input.imagesOnly,
      placement: input.placement ?? "inline",
    }),
  });
  const presign = (await presignRes.json()) as {
    error?: string;
    attachmentId?: string;
    uploadUrl?: string;
    headers?: Record<string, string>;
    mimeType?: string;
  };
  if (!presignRes.ok || !presign.uploadUrl || !presign.attachmentId) {
    throw new Error(presign.error || "Failed to prepare upload");
  }

  input.onProgress?.(10);

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", presign.uploadUrl!);
    const headers = presign.headers ?? {};
    for (const [k, v] of Object.entries(headers)) {
      xhr.setRequestHeader(k, v);
    }
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const pct = 10 + Math.round((e.loaded / e.total) * 80);
      input.onProgress?.(pct);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload network error"));
    xhr.send(input.file);
  });

  input.onProgress?.(95);

  const completeRes = await fetch("/api/storage/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ attachmentId: presign.attachmentId }),
  });
  const complete = (await completeRes.json()) as { error?: string };
  if (!completeRes.ok) {
    throw new Error(complete.error || "Failed to finalize upload");
  }
  input.onProgress?.(100);

  return {
    attachmentId: presign.attachmentId,
    mimeType: presign.mimeType || input.file.type,
    originalFilename: filename,
    sizeBytes: input.file.size,
  };
}

export async function listEntityFileAttachments(input: {
  entityType: AttachmentEntityType;
  entityId: string;
}): Promise<EntityFileAttachment[]> {
  const params = new URLSearchParams({
    entityType: input.entityType,
    entityId: input.entityId,
    placement: "attached",
  });
  const res = await fetch(`/api/storage/list-entity?${params.toString()}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { attachments?: EntityFileAttachment[] };
  return data.attachments ?? [];
}

export async function deleteAttachment(attachmentId: string): Promise<void> {
  const res = await fetch(`/api/storage/${attachmentId}`, { method: "DELETE" });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "Failed to remove attachment");
  }
}

export function formatAttachmentSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const urlCache = new Map<string, { url: string; expiresAt: number }>();

export async function resolveAttachmentDisplayUrl(
  attachmentId: string,
): Promise<string | null> {
  const cached = urlCache.get(attachmentId);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const res = await fetch(`/api/storage/${attachmentId}/url`);
  if (!res.ok) return null;
  const data = (await res.json()) as { url?: string };
  if (!data.url) return null;
  urlCache.set(attachmentId, {
    url: data.url,
    expiresAt: Date.now() + 45 * 60 * 1000,
  });
  return data.url;
}

export function extractAttachmentIdsFromHtml(html: string): string[] {
  const ids = new Set<string>();
  const re = /data-attachment-id=["']([0-9a-f-]{36})["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    ids.add(m[1]!.toLowerCase());
  }
  return [...ids];
}

/** After save: drop inline R2 objects no longer referenced in HTML. */
export async function syncInlineAttachmentsFromHtml(input: {
  entityType: AttachmentEntityType;
  entityId: string;
  html: string;
}): Promise<{ deleted: number } | null> {
  const keepAttachmentIds = extractAttachmentIdsFromHtml(input.html ?? "");
  const res = await fetch("/api/storage/sync-inline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entityType: input.entityType,
      entityId: input.entityId,
      keepAttachmentIds,
    }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    console.warn(
      "Inline attachment sync failed",
      data.error || res.statusText,
    );
    return null;
  }
  const data = (await res.json()) as { deleted?: number };
  return { deleted: data.deleted ?? 0 };
}

/** Discard every file for a draft entity (cancel comment, etc.). */
export async function cleanupEntityAttachmentsClient(input: {
  entityType: AttachmentEntityType;
  entityId: string;
}): Promise<void> {
  const res = await fetch("/api/storage/cleanup-entity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    console.warn(
      "Entity attachment cleanup failed",
      data.error || res.statusText,
    );
  }
}
