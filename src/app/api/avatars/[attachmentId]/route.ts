import { NextResponse } from "next/server";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { getStorageProvider, isR2Configured } from "@/lib/storage";
import { DEFAULT_SIGNED_URL_TTL } from "@/lib/storage/config";

type Ctx = { params: Promise<{ attachmentId: string }> };

/**
 * Stable avatar URL by attachment id. Redirects to a short-lived R2 signed URL
 * so Vercel does not stream image bytes (Fluid CPU). Attachment id changes on
 * every upload, so clients can keep using `/api/avatars/{id}` as a stable href.
 * Public for profile_picture only (UUID is unguessable; used on share portals).
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
    const signed = await storage.createSignedDownloadUrl(
      String(row.storage_key),
    );
    // Cache the redirect under the signed URL TTL so repeat img loads skip
    // the Function until the signature is near expiry.
    const maxAge = Math.max(60, Math.floor(DEFAULT_SIGNED_URL_TTL * 0.8));
    return NextResponse.redirect(signed, {
      status: 302,
      headers: {
        "Cache-Control": `public, max-age=${maxAge}`,
      },
    });
  } catch (err) {
    console.warn("Avatar redirect failed", err);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
