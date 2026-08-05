import { NextResponse } from "next/server";
import { requireAuthApiAccess } from "@/lib/api/require-auth";
import { isR2Configured, getStorageProvider } from "@/lib/storage";

type Ctx = { params: Promise<{ attachmentId: string }> };

/** DELETE /api/storage/[attachmentId] */
export async function DELETE(request: Request, ctx: Ctx) {
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
    .select("*")
    .eq("id", attachmentId)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (row.organization_id !== auth.caller.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const canDelete =
    row.uploaded_by_profile_id === auth.caller.id ||
    auth.caller.role === "admin" ||
    auth.caller.role === "manager";
  if (!canDelete) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const storage = getStorageProvider();
  try {
    await storage.deleteObject(row.storage_key);
  } catch (err) {
    console.warn("R2 delete failed", err);
  }

  if (row.entity_type === "profile_picture") {
    await auth.admin
      .from("people")
      .update({ avatar_attachment_id: null })
      .eq("avatar_attachment_id", attachmentId);
  }

  await auth.admin.from("attachments").delete().eq("id", attachmentId);
  return NextResponse.json({ ok: true });
}
