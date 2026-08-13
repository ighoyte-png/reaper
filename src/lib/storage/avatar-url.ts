/** Same-origin avatar proxy — stable until avatar_attachment_id changes. */
export function avatarContentPath(attachmentId: string): string {
  return `/api/avatars/${encodeURIComponent(attachmentId)}`;
}

/** Absolute URL for notifications / off-document consumers. */
export function avatarContentAbsoluteUrl(
  attachmentId: string,
  origin?: string,
): string {
  const path = avatarContentPath(attachmentId);
  if (origin) return `${origin.replace(/\/$/, "")}${path}`;
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  return path;
}
