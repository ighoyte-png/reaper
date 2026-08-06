/** Shared request origin / CSRF helpers for cookie-authenticated API routes. */

export const DEFAULT_PUBLIC_APP_ORIGIN = "https://app.reaperpm.com";

export function configuredSiteOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function isLocalhostOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
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

/**
 * Origin to embed in user-facing links (share URLs, invite redirects).
 * Prefers the live request host, then non-local SITE_URL, then production.
 * Avoids baking localhost into invite emails when SITE_URL is misconfigured.
 */
export function requestSiteOrigin(request: Request): string {
  const fromReq = originFromRequest(request);
  if (fromReq && !isLocalhostOrigin(fromReq)) return fromReq;

  const configured = configuredSiteOrigin();
  if (configured && !isLocalhostOrigin(configured)) return configured;

  if (fromReq) return fromReq;
  if (configured) return configured;
  return DEFAULT_PUBLIC_APP_ORIGIN;
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

/** www / non-www and http / https aliases for the same deployment host. */
export function expandOriginVariants(origin: string): string[] {
  const variants = new Set<string>([origin]);
  try {
    const url = new URL(origin);
    const portSuffix = url.port ? `:${url.port}` : "";
    const bareHost = url.hostname.startsWith("www.")
      ? url.hostname.slice(4)
      : url.hostname;
    const wwwHost = url.hostname.startsWith("www.")
      ? url.hostname
      : `www.${url.hostname}`;

    for (const host of [url.hostname, bareHost, wwwHost]) {
      variants.add(`${url.protocol}//${host}${portSuffix}`);
      if (url.protocol === "http:") {
        variants.add(`https://${host}${portSuffix}`);
      }
    }
  } catch {
    /* ignore invalid origin */
  }
  return [...variants];
}

function collectAllowedOrigins(request: Request): Set<string> {
  const allowed = new Set<string>();
  for (const candidate of [
    requestSiteOrigin(request),
    configuredSiteOrigin(),
  ]) {
    if (!candidate) continue;
    for (const variant of expandOriginVariants(candidate)) {
      allowed.add(variant);
    }
  }
  return allowed;
}

function callerOriginAllowed(
  callerOrigin: string,
  allowed: Set<string>,
): boolean {
  for (const variant of expandOriginVariants(callerOrigin)) {
    if (allowed.has(variant)) return true;
  }
  return false;
}

/**
 * CSRF guard for cookie-authenticated mutations.
 * Allows the live request host, configured SITE_URL aliases, and same-origin fetches.
 */
export function assertAllowedSiteOrigin(request: Request): {
  ok: boolean;
  origin: string;
} {
  const origin = requestSiteOrigin(request);
  const allowed = collectAllowedOrigins(request);

  const callerOrigin = requestOriginHeader(request);
  if (!callerOrigin) {
    return { ok: true, origin };
  }
  if (callerOriginAllowed(callerOrigin, allowed)) {
    return { ok: true, origin };
  }

  // Browsers label in-app fetch() as same-origin even when Origin/Referer differ
  // from x-forwarded-host (common behind reverse proxies).
  if (request.headers.get("sec-fetch-site") === "same-origin") {
    return { ok: true, origin };
  }

  return { ok: false, origin };
}

/** @deprecated Use assertAllowedSiteOrigin or requestSiteOrigin. */
export function siteOriginFromRequest(request: Request): {
  ok: boolean;
  origin: string;
} {
  return assertAllowedSiteOrigin(request);
}
