import { NextResponse } from "next/server";
import { requireAuthApiAccess } from "@/lib/api/require-auth";
import { isR2Configured, getStorageProvider } from "@/lib/storage";
import { assertCanReadAttachment } from "@/lib/storage/authz";

type Ctx = { params: Promise<{ name: string }> };

/** Resolve a workspace custom emoji by Slack-style handle → signed R2 URL. */
export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireAuthApiAccess(request);
  if ("error" in auth) return auth.error;

  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "R2 storage is not configured" },
      { status: 503 },
    );
  }

  const { name: rawName } = await ctx.params;
  const name = decodeURIComponent(rawName ?? "")
    .trim()
    .toLowerCase()
    .replace(/^:+|:+$/g, "");
  if (!/^[a-z0-9_]{2,32}$/.test(name)) {
    return NextResponse.json({ error: "Invalid emoji name" }, { status: 400 });
  }

  const { data: emoji, error: emojiError } = await auth.supabase
    .from("organization_emojis")
    .select("id, attachment_id, name")
    .eq("organization_id", auth.caller.organization_id)
    .eq("name", name)
    .maybeSingle();

  if (emojiError || !emoji?.attachment_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: row, error } = await auth.admin
    .from("attachments")
    .select(
      "id, organization_id, storage_key, ready, mime_type, original_filename",
    )
    .eq("id", emoji.attachment_id)
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

  const url = new URL(request.url);
  const wantJson = url.searchParams.get("format") === "json";
  const storage = getStorageProvider();
  const signed = await storage.createSignedDownloadUrl(row.storage_key);

  if (!wantJson) {
    return NextResponse.redirect(signed, { status: 302 });
  }

  return NextResponse.json({
    url: signed,
    name: emoji.name,
    mimeType: row.mime_type,
    filename: row.original_filename,
  });
}
