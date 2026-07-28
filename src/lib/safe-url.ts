/** Normalize and validate external URLs used in project assets / notebook links. */

export function sanitizeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let candidate = trimmed;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return null;
  }
  if (url.username || url.password) {
    return null;
  }
  return url.toString();
}

export function requireHttpsAssetUrl(raw: string): string {
  const safe = sanitizeExternalUrl(raw);
  if (!safe) {
    throw new Error("Asset URL must be a valid http(s) link");
  }
  return safe;
}
