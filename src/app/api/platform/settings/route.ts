import { NextResponse } from "next/server";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import {
  DEFAULT_MAX_DOCUMENT_BYTES,
  DEFAULT_MAX_IMAGE_BYTES,
} from "@/lib/storage/config";
import { KNOWN_ADDON_KEYS } from "@/lib/accounts/addons";

type AppSettingsRow = {
  allow_workspace_signup?: boolean;
  require_account_approval?: boolean;
  default_allowed_addons?: string[] | null;
  max_image_bytes?: number;
  max_document_bytes?: number;
};

export type PlatformAppSettings = {
  allow_workspace_signup: boolean;
  require_account_approval: boolean;
  default_allowed_addons: string[];
  max_image_bytes: number;
  max_document_bytes: number;
};

function normalizeAddonKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const known = new Set<string>(KNOWN_ADDON_KEYS);
  return [
    ...new Set(
      raw
        .map((k) => String(k).trim().toLowerCase())
        .filter((k) => known.has(k)),
    ),
  ];
}

function defaults(): PlatformAppSettings {
  return {
    allow_workspace_signup: true,
    require_account_approval: false,
    default_allowed_addons: [],
    max_image_bytes: DEFAULT_MAX_IMAGE_BYTES,
    max_document_bytes: DEFAULT_MAX_DOCUMENT_BYTES,
  };
}

function fromRow(row: AppSettingsRow | null | undefined): PlatformAppSettings {
  if (!row) return defaults();
  return {
    allow_workspace_signup: Boolean(row.allow_workspace_signup),
    require_account_approval: Boolean(row.require_account_approval),
    default_allowed_addons: normalizeAddonKeys(row.default_allowed_addons),
    max_image_bytes:
      typeof row.max_image_bytes === "number" && row.max_image_bytes > 0
        ? row.max_image_bytes
        : DEFAULT_MAX_IMAGE_BYTES,
    max_document_bytes:
      typeof row.max_document_bytes === "number" && row.max_document_bytes > 0
        ? row.max_document_bytes
        : DEFAULT_MAX_DOCUMENT_BYTES,
  };
}

async function readAppSettings(): Promise<PlatformAppSettings> {
  if (!isSupabaseConfigured() || !isServiceRoleConfigured()) {
    return defaults();
  }
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("app_settings")
      .select(
        "allow_workspace_signup, require_account_approval, default_allowed_addons, max_image_bytes, max_document_bytes",
      )
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) return defaults();
    return fromRow(data as AppSettingsRow);
  } catch {
    return defaults();
  }
}

/** Public: login + register use this for signup / approval gates. */
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
    require_account_approval?: boolean;
    default_allowed_addons?: string[];
    max_image_bytes?: number;
    max_document_bytes?: number;
  };

  const patch: Record<string, unknown> = { id: 1 };
  if (typeof body.allow_workspace_signup === "boolean") {
    patch.allow_workspace_signup = body.allow_workspace_signup;
  }
  if (typeof body.require_account_approval === "boolean") {
    patch.require_account_approval = body.require_account_approval;
  }
  if (Array.isArray(body.default_allowed_addons)) {
    patch.default_allowed_addons = normalizeAddonKeys(
      body.default_allowed_addons,
    );
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
          "Provide allow_workspace_signup, require_account_approval, default_allowed_addons, and/or upload limits",
      },
      { status: 400 },
    );
  }

  const { data, error } = await admin
    .from("app_settings")
    .upsert(patch)
    .select(
      "allow_workspace_signup, require_account_approval, default_allowed_addons, max_image_bytes, max_document_bytes",
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(fromRow(data as AppSettingsRow));
}
