import { NextResponse } from "next/server";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import {
  DEFAULT_MAX_DOCUMENT_BYTES,
  DEFAULT_MAX_IMAGE_BYTES,
} from "@/lib/storage/config";

type AppSettingsRow = {
  allow_workspace_signup?: boolean;
  max_image_bytes?: number;
  max_document_bytes?: number;
};

async function readAppSettings(): Promise<{
  allow_workspace_signup: boolean;
  max_image_bytes: number;
  max_document_bytes: number;
}> {
  if (!isSupabaseConfigured() || !isServiceRoleConfigured()) {
    return {
      allow_workspace_signup: true,
      max_image_bytes: DEFAULT_MAX_IMAGE_BYTES,
      max_document_bytes: DEFAULT_MAX_DOCUMENT_BYTES,
    };
  }
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("app_settings")
      .select("allow_workspace_signup, max_image_bytes, max_document_bytes")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) {
      return {
        allow_workspace_signup: true,
        max_image_bytes: DEFAULT_MAX_IMAGE_BYTES,
        max_document_bytes: DEFAULT_MAX_DOCUMENT_BYTES,
      };
    }
    const row = data as AppSettingsRow;
    return {
      allow_workspace_signup: Boolean(row.allow_workspace_signup),
      max_image_bytes:
        typeof row.max_image_bytes === "number" && row.max_image_bytes > 0
          ? row.max_image_bytes
          : DEFAULT_MAX_IMAGE_BYTES,
      max_document_bytes:
        typeof row.max_document_bytes === "number" &&
        row.max_document_bytes > 0
          ? row.max_document_bytes
          : DEFAULT_MAX_DOCUMENT_BYTES,
    };
  } catch {
    return {
      allow_workspace_signup: true,
      max_image_bytes: DEFAULT_MAX_IMAGE_BYTES,
      max_document_bytes: DEFAULT_MAX_DOCUMENT_BYTES,
    };
  }
}

/** Public: login page uses this to hide Create workspace. */
export async function GET() {
  const settings = await readAppSettings();
  return NextResponse.json(settings);
}

export async function PATCH(request: Request) {
  const auth = await requirePlatformAdmin();
  if ("error" in auth && auth.error) return auth.error;
  const { admin } = auth;

  const body = (await request.json()) as {
    allow_workspace_signup?: boolean;
    max_image_bytes?: number;
    max_document_bytes?: number;
  };

  const patch: Record<string, unknown> = { id: 1 };
  if (typeof body.allow_workspace_signup === "boolean") {
    patch.allow_workspace_signup = body.allow_workspace_signup;
  }
  if (typeof body.max_image_bytes === "number" && body.max_image_bytes > 0) {
    patch.max_image_bytes = Math.round(body.max_image_bytes);
  }
  if (
    typeof body.max_document_bytes === "number" &&
    body.max_document_bytes > 0
  ) {
    patch.max_document_bytes = Math.round(body.max_document_bytes);
  }

  if (Object.keys(patch).length <= 1) {
    return NextResponse.json(
      {
        error:
          "Provide allow_workspace_signup and/or max_image_bytes / max_document_bytes",
      },
      { status: 400 },
    );
  }

  const { data, error } = await admin
    .from("app_settings")
    .upsert(patch)
    .select("allow_workspace_signup, max_image_bytes, max_document_bytes")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const row = data as AppSettingsRow;
  return NextResponse.json({
    allow_workspace_signup: Boolean(row.allow_workspace_signup),
    max_image_bytes:
      typeof row.max_image_bytes === "number" && row.max_image_bytes > 0
        ? row.max_image_bytes
        : DEFAULT_MAX_IMAGE_BYTES,
    max_document_bytes:
      typeof row.max_document_bytes === "number" && row.max_document_bytes > 0
        ? row.max_document_bytes
        : DEFAULT_MAX_DOCUMENT_BYTES,
  });
}
