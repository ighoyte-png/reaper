import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "person-avatars";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function extForMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "jpg";
  }
}

/** Upload a person photo; returns a storage object path (not a public URL). */
export async function uploadPersonAvatar(
  supabase: SupabaseClient,
  organizationId: string,
  personId: string,
  file: File,
): Promise<string> {
  const mime = (file.type || "").toLowerCase();
  if (!ALLOWED_TYPES.has(mime)) {
    throw new Error("Avatar must be a JPEG, PNG, WebP, or GIF image");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Avatar must be 5MB or smaller");
  }

  const path = `${organizationId}/${personId}/${crypto.randomUUID()}.${extForMime(mime)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: mime,
  });
  if (error) throw error;
  return path;
}

/** Resolve a stored avatar path or legacy public URL to a displayable URL. */
export async function resolveAvatarUrl(
  supabase: SupabaseClient,
  avatar: string | null | undefined,
  opts?: { expiresIn?: number },
): Promise<string | null> {
  if (!avatar) return null;
  if (avatar.startsWith("data:") || /^https?:\/\//i.test(avatar)) {
    return avatar;
  }
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(avatar, opts?.expiresIn ?? 60 * 60);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Read a local File as a data URL (demo / offline mode). */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Read failed"));
    reader.readAsDataURL(file);
  });
}
