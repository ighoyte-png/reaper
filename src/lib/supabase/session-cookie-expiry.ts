import type { NextRequest } from "next/server";

/** Refresh when the access token expires within this window. */
export const SESSION_REFRESH_MARGIN_SEC = 5 * 60;

function decodeBase64UrlJson(value: string): unknown | null {
  try {
    let raw = value;
    if (raw.startsWith("base64-")) {
      const b64 = raw
        .slice("base64-".length)
        .replace(/-/g, "+")
        .replace(/_/g, "/");
      raw = Buffer.from(b64, "base64").toString("utf8");
    }
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function jwtExpUnix(accessToken: string): number | null {
  const parts = accessToken.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(
      Buffer.from(payload, "base64").toString("utf8"),
    ) as { exp?: unknown };
    return typeof json.exp === "number" ? json.exp : null;
  } catch {
    return null;
  }
}

/**
 * Unix expiry for the Supabase access token in request cookies, or null if
 * absent / unreadable. Cookie format matches @supabase/ssr (chunked, optional
 * base64- JSON session).
 */
export function readAccessTokenExpiresAtUnix(
  request: NextRequest,
): number | null {
  const byBase = new Map<string, { idx: number; value: string }[]>();
  for (const { name, value } of request.cookies.getAll()) {
    const match = name.match(/^(sb-.+-auth-token)(?:\.(\d+))?$/);
    if (!match) continue;
    const base = match[1]!;
    const idx = match[2] != null ? Number(match[2]) : -1;
    const list = byBase.get(base) ?? [];
    list.push({ idx, value });
    byBase.set(base, list);
  }
  if (byBase.size === 0) return null;

  for (const chunks of byBase.values()) {
    chunks.sort((a, b) => a.idx - b.idx);
    const combined = chunks.map((c) => c.value).join("");
    const parsed = decodeBase64UrlJson(combined);
    if (!parsed || typeof parsed !== "object") continue;
    const session = parsed as {
      expires_at?: unknown;
      access_token?: unknown;
    };
    if (typeof session.expires_at === "number") {
      return session.expires_at;
    }
    if (typeof session.access_token === "string") {
      const exp = jwtExpUnix(session.access_token);
      if (exp != null) return exp;
    }
  }
  return null;
}

export function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((c) => /^sb-.+-auth-token(?:\.\d+)?$/.test(c.name));
}

/**
 * Whether proxy should call getUser() to refresh cookies.
 * - No auth cookie → skip (nothing to refresh).
 * - Unreadable expiry → refresh (safe fallback).
 * - Otherwise only when expiring within SESSION_REFRESH_MARGIN_SEC.
 */
export function sessionNeedsRefresh(request: NextRequest): boolean {
  if (!hasSupabaseAuthCookie(request)) return false;
  const expiresAt = readAccessTokenExpiresAtUnix(request);
  if (expiresAt == null) return true;
  const now = Math.floor(Date.now() / 1000);
  return expiresAt - now <= SESSION_REFRESH_MARGIN_SEC;
}
