import { NextResponse } from "next/server";
import { requireAuthApiAccess } from "@/lib/api/require-auth";
import { isR2Configured, getStorageProvider } from "@/lib/storage";
import { checkStorageRateLimit } from "@/lib/storage/authz";

type Body = {
  attachmentId?: string;
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
  if (!checkStorageRateLimit(auth.caller.id, 80)) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429 },
    );
  }

  const body = (await request.json()) as Body;
  const attachmentId = body.attachmentId?.trim();
  if (!attachmentId) {
    return NextResponse.json(
      { error: "attachmentId required" },
      { status: 400 },
    );
  }

  const { data: row, error } = await auth.admin
    .from("attachments")
    .select("*")
    .eq("id", attachmentId)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }
  if (row.organization_id !== auth.caller.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (
    row.uploaded_by_profile_id &&
    row.uploaded_by_profile_id !== auth.caller.id &&
    auth.caller.role !== "admin" &&
    auth.caller.role !== "manager"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const storage = getStorageProvider();
  const head = await storage.head(row.storage_key);
  if (!head.exists) {
    await auth.admin.from("attachments").delete().eq("id", attachmentId);
    return NextResponse.json(
      { error: "Upload not found in storage" },
      { status: 400 },
    );
  }

  const { error: updateError } = await auth.admin
    .from("attachments")
    .update({
      ready: true,
      size_bytes: head.contentLength ?? row.size_bytes,
      mime_type: head.contentType || row.mime_type,
    })
    .eq("id", attachmentId);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 },
    );
  }

  // Profile picture swap: point person at new attachment and remove previous.
  if (row.entity_type === "profile_picture") {
    const { data: person } = await auth.admin
      .from("people")
      .select("id, avatar_attachment_id")
      .eq("id", row.entity_id)
      .maybeSingle();

    const previousId = person?.avatar_attachment_id as string | null;
    await auth.admin
      .from("people")
      .update({
        avatar_attachment_id: attachmentId,
        avatar_url: null,
      })
      .eq("id", row.entity_id);

    if (previousId && previousId !== attachmentId) {
      const { data: prev } = await auth.admin
        .from("attachments")
        .select("id, storage_key")
        .eq("id", previousId)
        .maybeSingle();
      if (prev) {
        try {
          await storage.deleteObject(prev.storage_key);
        } catch (err) {
          console.warn("Failed to delete previous avatar object", err);
        }
        await auth.admin.from("attachments").delete().eq("id", previousId);
      }
    }
  }

  return NextResponse.json({ ok: true, attachmentId });
}
