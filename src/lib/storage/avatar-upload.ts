import { createClient } from "@/lib/supabase/client";
import {
  readFileAsDataUrl,
  uploadPersonAvatar,
} from "@/lib/supabase/avatar";
import {
  resolveAttachmentDisplayUrl,
  uploadFileToR2,
} from "@/lib/storage/client-upload";

let r2Probe: boolean | undefined;

/** Best-effort: R2 routes return 503 when storage is not configured. */
export async function isR2StorageAvailable(): Promise<boolean> {
  if (r2Probe !== undefined) return r2Probe;
  try {
    const res = await fetch("/api/storage/presign-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.status === 503 && body.error?.includes("not configured")) {
      r2Probe = false;
      return false;
    }
    r2Probe = true;
    return true;
  } catch {
    r2Probe = false;
    return false;
  }
}

export type PersonAvatarUploadResult = {
  avatarUrl: string | null;
  avatarAttachmentId: string | null;
};

/** Supabase mode: R2 when configured, else legacy person-avatars bucket. Demo: data URL. */
export async function uploadPersonAvatarFile(input: {
  mode: "demo" | "supabase";
  organizationId: string;
  personId: string;
  file: File;
}): Promise<PersonAvatarUploadResult> {
  if (input.mode === "demo") {
    return {
      avatarUrl: await readFileAsDataUrl(input.file),
      avatarAttachmentId: null,
    };
  }

  if (await isR2StorageAvailable()) {
    const { attachmentId } = await uploadFileToR2({
      file: input.file,
      entityType: "profile_picture",
      entityId: input.personId,
      imagesOnly: true,
    });
    const avatarUrl = await resolveAttachmentDisplayUrl(attachmentId);
    return { avatarUrl, avatarAttachmentId: attachmentId };
  }

  const supabase = createClient();
  const avatarUrl = await uploadPersonAvatar(
    supabase,
    input.organizationId,
    input.personId,
    input.file,
  );
  return { avatarUrl, avatarAttachmentId: null };
}
