/** Shared request origin / CSRF helpers for cookie-authenticated API routes. */

export function configuredSiteOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function siteOriginFromRequest(request: Request): {
  ok: boolean;
  origin: string;
} {
  const configured = configuredSiteOrigin();
  if (!configured) {
    // Local/dev fallback when SITE_URL is unset.
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    const proto = request.headers.get("x-forwarded-proto") || "http";
    if (!host) return { ok: false, origin: "" };
    return { ok: true, origin: `${proto}://${host}` };
  }

  const originHeader = request.headers.get("origin");
  if (originHeader) {
    try {
      if (new URL(originHeader).origin !== configured) {
        return { ok: false, origin: configured };
      }
    } catch {
      return { ok: false, origin: configured };
    }
  }

  return { ok: true, origin: configured };
}
