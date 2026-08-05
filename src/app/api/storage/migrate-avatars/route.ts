import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import {
  buildStorageKey,
  getR2Config,
  getStorageProvider,
  isR2Configured,
  sanitizeOriginalFilename,
  validateUploadFile,
} from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "person-avatars";

function extForMime(mime: string): string {
  switch (mime.toLowerCase()) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "jpg";
  }
}

async function loadAvatarBytes(
  admin: ReturnType<typeof createAdminClient>,
  avatarUrl: string,
): Promise<{ bytes: Uint8Array; mimeType: string; filename: string } | null> {
  if (avatarUrl.startsWith("data:")) {
    const match = /^data:([^;]+);base64,(.+)$/i.exec(avatarUrl);
    if (!match) return null;
    const mimeType = match[1]!.toLowerCase();
    const bytes = Uint8Array.from(atob(match[2]!), (c) => c.charCodeAt(0));
    return {
      bytes,
      mimeType,
      filename: `avatar.${extForMime(mimeType)}`,
    };
  }

  if (/^https?:\/\//i.test(avatarUrl)) {
    const res = await fetch(avatarUrl);
    if (!res.ok) return null;
    const mimeType =
      res.headers.get("content-type")?.split(";")[0]?.trim() ||
      "image/jpeg";
    const buf = new Uint8Array(await res.arrayBuffer());
    return {
      bytes: buf,
      mimeType,
      filename: `avatar.${extForMime(mimeType)}`,
    };
  }

  const { data, error } = await admin.storage.from(BUCKET).download(avatarUrl);
  if (error || !data) return null;
  const mimeType = data.type || "image/jpeg";
  return {
    bytes: new Uint8Array(await data.arrayBuffer()),
    mimeType,
    filename: avatarUrl.split("/").pop() || `avatar.${extForMime(mimeType)}`,
  };
}

export async function POST() {
  const auth = await requirePlatformAdmin();
  if ("error" in auth && auth.error) return auth.error;
  const { admin } = auth;

  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "R2 storage is not configured" },
      { status: 503 },
    );
  }

  const { data: people, error } = await admin
    .from("people")
    .select("id, organization_id, avatar_url, avatar_attachment_id")
    .not("avatar_url", "is", null)
    .is("avatar_attachment_id", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const storage = getStorageProvider();
  const r2Bucket = getR2Config().bucket;

  let migrated = 0;
  let skipped = 0;
  const failed: { personId: string; error: string }[] = [];

  for (const person of people ?? []) {
    const personId = String(person.id);
    const orgId = String(person.organization_id);
    const avatarUrl = person.avatar_url ? String(person.avatar_url) : "";
    if (!avatarUrl) {
      skipped += 1;
      continue;
    }

    try {
      const loaded = await loadAvatarBytes(admin, avatarUrl);
      if (!loaded) {
        failed.push({ personId, error: "Could not load avatar bytes" });
        continue;
      }

      const filename = sanitizeOriginalFilename(loaded.filename);
      const validated = validateUploadFile({
        filename,
        mimeType: loaded.mimeType,
        sizeBytes: loaded.bytes.length,
        magicBytes: loaded.bytes.slice(0, 32),
        imagesOnly: true,
      });
      if (!validated.ok) {
        failed.push({ personId, error: validated.error });
        continue;
      }

      const attachmentId = crypto.randomUUID();
      const storageKey = buildStorageKey(
        "profile_picture",
        personId,
        validated.extension,
        attachmentId,
      );

      await storage.putObject({
        key: storageKey,
        body: loaded.bytes,
        contentType: validated.mimeType,
      });

      const { error: insertError } = await admin.from("attachments").insert({
        id: attachmentId,
        organization_id: orgId,
        uploaded_by_profile_id: null,
        entity_type: "profile_picture",
        entity_id: personId,
        storage_provider: "r2",
        bucket: r2Bucket,
        storage_key: storageKey,
        original_filename: filename,
        mime_type: validated.mimeType,
        size_bytes: loaded.bytes.length,
        ready: true,
      });
      if (insertError) throw insertError;

      const { error: personError } = await admin
        .from("people")
        .update({ avatar_attachment_id: attachmentId })
        .eq("id", personId)
        .is("avatar_attachment_id", null);
      if (personError) throw personError;

      migrated += 1;
    } catch (err) {
      failed.push({
        personId,
        error: err instanceof Error ? err.message : "Migration failed",
      });
    }
  }

  return NextResponse.json({ migrated, skipped, failed });
}
