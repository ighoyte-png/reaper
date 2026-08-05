import { NextResponse } from "next/server";
import { requireAuthApiAccess } from "@/lib/api/require-auth";
import { isR2Configured, getStorageProvider } from "@/lib/storage";
import {
  assertCanAttachToEntity,
  checkStorageRateLimit,
  readStorageLimits,
} from "@/lib/storage/authz";
import { buildStorageKey, sanitizeOriginalFilename } from "@/lib/storage/keys";
import { validateUploadFile } from "@/lib/storage/validate";
import type { AttachmentEntityType } from "@/lib/storage/types";

type Body = {
  entityType?: AttachmentEntityType;
  entityId?: string;
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
  /** Base64 of first 32 bytes (optional magic sniff). */
  magicBase64?: string;
  imagesOnly?: boolean;
};

export async function POST(request: Request) {
  const auth = await requireAuthApiAccess(request);
  if ("error" in auth) return auth.error;

  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "R2 storage is not configured" },
      { status: 503 },
    );
  }

  if (!checkStorageRateLimit(auth.caller.id)) {
    return NextResponse.json(
      { error: "Upload rate limit exceeded. Try again shortly." },
      { status: 429 },
    );
  }

  const body = (await request.json()) as Body;
  const entityType = body.entityType;
  const entityId = body.entityId?.trim();
  const filename = sanitizeOriginalFilename(body.filename ?? "file");
  const mimeType = body.mimeType ?? "";
  const sizeBytes = Number(body.sizeBytes);

  if (
    entityType !== "profile_picture" &&
    entityType !== "comment" &&
    entityType !== "task_note"
  ) {
    return NextResponse.json({ error: "Invalid entityType" }, { status: 400 });
  }
  if (!entityId) {
    return NextResponse.json({ error: "entityId required" }, { status: 400 });
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return NextResponse.json({ error: "sizeBytes required" }, { status: 400 });
  }

  const authz = await assertCanAttachToEntity(auth.admin, {
    organizationId: auth.caller.organization_id,
    profileId: auth.caller.id,
    role: auth.caller.role,
    entityType,
    entityId,
  });
  if (!authz.ok) {
    return NextResponse.json(
      { error: authz.error },
      { status: authz.status },
    );
  }

  let magicBytes: Uint8Array | null = null;
  if (body.magicBase64) {
    try {
      magicBytes = Uint8Array.from(atob(body.magicBase64), (c) =>
        c.charCodeAt(0),
      );
    } catch {
      return NextResponse.json(
        { error: "Invalid magicBase64" },
        { status: 400 },
      );
    }
  }

  const limits = await readStorageLimits(auth.admin);
  const validated = validateUploadFile({
    filename,
    mimeType,
    sizeBytes,
    magicBytes,
    imagesOnly: Boolean(body.imagesOnly) || entityType === "profile_picture",
    maxImageBytes: limits.maxImageBytes,
    maxDocumentBytes: limits.maxDocumentBytes,
  });
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const storage = getStorageProvider();
  const attachmentId = crypto.randomUUID();
  const storageKey = buildStorageKey(
    entityType,
    entityId,
    validated.extension,
    attachmentId,
  );

  const { error: insertError } = await auth.admin.from("attachments").insert({
    id: attachmentId,
    organization_id: auth.caller.organization_id,
    uploaded_by_profile_id: auth.caller.id,
    entity_type: entityType,
    entity_id: entityId,
    storage_provider: "r2",
    bucket: storage.bucket,
    storage_key: storageKey,
    original_filename: filename,
    mime_type: validated.mimeType,
    size_bytes: sizeBytes,
    ready: false,
  });

  if (insertError) {
    return NextResponse.json(
      { error: insertError.message },
      { status: 500 },
    );
  }

  try {
    const presigned = await storage.createPresignedUpload({
      key: storageKey,
      contentType: validated.mimeType,
      contentLength: sizeBytes,
    });
    return NextResponse.json({
      attachmentId,
      storageKey,
      uploadUrl: presigned.uploadUrl,
      headers: presigned.headers,
      expiresIn: presigned.expiresIn,
      mimeType: validated.mimeType,
    });
  } catch (err) {
    await auth.admin.from("attachments").delete().eq("id", attachmentId);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to create upload URL",
      },
      { status: 500 },
    );
  }
}
