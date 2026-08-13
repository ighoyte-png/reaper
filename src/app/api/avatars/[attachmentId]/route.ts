import { NextResponse } from "next/server";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { getStorageProvider, isR2Configured } from "@/lib/storage";

type Ctx = { params: Promise<{ attachmentId: string }> };

/**
 * Stable avatar bytes URL. Attachment id changes on every upload, so browsers
 * may cache forever (`immutable`) until the person gets a new attachment id.
 * Public for profile_picture only (UUID is unguessable; avatars are shown in
 * share portals without a session).
 */
export async function GET(_request: Request, ctx: Ctx) {
  if (!isR2Configured() || !isServiceRoleConfigured()) {
    return NextResponse.json(
      { error: "Avatar storage is not configured" },
      { status: 503 },
    );
  }

  const { attachmentId } = await ctx.params;
  if (!attachmentId?.trim()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("attachments")
    .select("id, entity_type, storage_key, mime_type, ready")
    .eq("id", attachmentId)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (row.entity_type !== "profile_picture" || !row.ready) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const storage = getStorageProvider();
    const obj = await storage.getObject(String(row.storage_key));
    const headers = new Headers();
    headers.set(
      "Content-Type",
      obj.contentType || String(row.mime_type || "image/jpeg"),
    );
    headers.set(
      "Cache-Control",
      "public, max-age=31536000, immutable",
    );
    headers.set("ETag", `"${attachmentId}"`);
    if (typeof obj.contentLength === "number") {
      headers.set("Content-Length", String(obj.contentLength));
    }
    return new NextResponse(obj.body, { status: 200, headers });
  } catch (err) {
    console.warn("Avatar stream failed", err);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
