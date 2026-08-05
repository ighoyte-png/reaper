import { NextResponse } from "next/server";
import { requireAuthApiAccess } from "@/lib/api/require-auth";
import { isR2Configured, getStorageProvider } from "@/lib/storage";
import { assertCanReadAttachment } from "@/lib/storage/authz";

type Ctx = { params: Promise<{ attachmentId: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireAuthApiAccess(request);
  if ("error" in auth) return auth.error;

  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "R2 storage is not configured" },
      { status: 503 },
    );
  }

  const { attachmentId } = await ctx.params;
  const { data: row, error } = await auth.admin
    .from("attachments")
    .select(
      "id, organization_id, storage_key, ready, mime_type, original_filename",
    )
    .eq("id", attachmentId)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (
    !(await assertCanReadAttachment(auth.admin, {
      organizationId: auth.caller.organization_id,
      attachmentOrgId: row.organization_id,
    }))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!row.ready) {
    return NextResponse.json(
      { error: "Attachment not ready" },
      { status: 409 },
    );
  }

  const download = new URL(request.url).searchParams.get("download") === "1";
  const storage = getStorageProvider();
  const url = await storage.createSignedDownloadUrl(row.storage_key, {
    downloadFilename: download
      ? String(row.original_filename || "download")
      : undefined,
  });
  return NextResponse.json({
    url,
    mimeType: row.mime_type,
    filename: row.original_filename,
  });
}
