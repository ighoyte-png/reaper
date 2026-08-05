import { NextResponse } from "next/server";
import { requireAuthApiAccess } from "@/lib/api/require-auth";
import type {
  AttachmentEntityType,
  AttachmentPlacement,
} from "@/lib/storage/types";

/** GET /api/storage/list-entity?entityType=&entityId=&placement=attached */
export async function GET(request: Request) {
  const auth = await requireAuthApiAccess(request);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const entityType = url.searchParams.get("entityType") as AttachmentEntityType | null;
  const entityId = url.searchParams.get("entityId")?.trim() ?? "";
  const placement = (url.searchParams.get("placement") ??
    "attached") as AttachmentPlacement;

  if (
    entityType !== "comment" &&
    entityType !== "task_note" &&
    entityType !== "profile_picture"
  ) {
    return NextResponse.json({ error: "Invalid entityType" }, { status: 400 });
  }
  if (!entityId) {
    return NextResponse.json({ error: "entityId required" }, { status: 400 });
  }
  if (placement !== "inline" && placement !== "attached") {
    return NextResponse.json({ error: "Invalid placement" }, { status: 400 });
  }

  const { data, error } = await auth.admin
    .from("attachments")
    .select("id, original_filename, mime_type, size_bytes")
    .eq("organization_id", auth.caller.organization_id)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("placement", placement)
    .eq("ready", true)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    attachments: (data ?? []).map((row) => ({
      id: row.id as string,
      original_filename: row.original_filename as string,
      mime_type: row.mime_type as string,
      size_bytes: Number(row.size_bytes),
    })),
  });
}
