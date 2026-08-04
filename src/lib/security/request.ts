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

/** Live app origin from the incoming request (deployment host, localhost, etc.). */
export function originFromRequest(request: Request): string | null {
  const host =
    request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!host) return null;
  const hostname = host.split(",")[0]?.trim();
  if (!hostname) return null;
  const protoHeader = request.headers.get("x-forwarded-proto");
  const proto =
    protoHeader?.split(",")[0]?.trim() ||
    (hostname.includes("localhost") || hostname.startsWith("127.0.0.1")
      ? "http"
      : "https");
  try {
    return new URL(`${proto}://${hostname}`).origin;
  } catch {
    return null;
  }
}

/** Origin to embed in user-facing links (share URLs, invite redirects). */
export function requestSiteOrigin(request: Request): string {
  return (
    originFromRequest(request) ||
    configuredSiteOrigin() ||
    "http://localhost:3000"
  );
}

function requestOriginHeader(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).origin;
    } catch {
      return null;
    }
  }
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * CSRF guard for cookie-authenticated mutations.
 * Allows the live request host and optional configured SITE_URL alias.
 */
export function assertAllowedSiteOrigin(request: Request): {
  ok: boolean;
  origin: string;
} {
  const origin = requestSiteOrigin(request);
  const allowed = new Set<string>([origin]);
  const configured = configuredSiteOrigin();
  if (configured) allowed.add(configured);

  const callerOrigin = requestOriginHeader(request);
  if (callerOrigin && !allowed.has(callerOrigin)) {
    return { ok: false, origin };
  }

  return { ok: true, origin };
}

/** @deprecated Use assertAllowedSiteOrigin or requestSiteOrigin. */
export function siteOriginFromRequest(request: Request): {
  ok: boolean;
  origin: string;
} {
  return assertAllowedSiteOrigin(request);
}
