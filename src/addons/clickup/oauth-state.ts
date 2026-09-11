/** Signed OAuth state for ClickUp connect CSRF protection. */

import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export type ClickUpOAuthStatePayload = {
  orgId: string;
  profileId: string;
  purpose: "user" | "service";
  workspaceSlug: string;
  exp: number;
  nonce: string;
};

function stateSecret(fallback?: string | null): string {
  return (
    process.env.CLICKUP_OAUTH_STATE_SECRET?.trim() ||
    fallback?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "clickup-oauth-dev-secret"
  );
}

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export function signOAuthState(
  payload: Omit<ClickUpOAuthStatePayload, "exp" | "nonce"> & {
    ttlSec?: number;
  },
  secretFallback?: string | null,
): string {
  const body: ClickUpOAuthStatePayload = {
    orgId: payload.orgId,
    profileId: payload.profileId,
    purpose: payload.purpose,
    workspaceSlug: payload.workspaceSlug || "",
    exp: Math.floor(Date.now() / 1000) + (payload.ttlSec ?? 600),
    nonce: b64url(randomBytes(16)),
  };
  const payloadB64 = b64url(JSON.stringify(body));
  const sig = createHmac("sha256", stateSecret(secretFallback))
    .update(payloadB64)
    .digest();
  return `${payloadB64}.${b64url(sig)}`;
}

export function verifyOAuthState(
  state: string,
  secretFallback?: string | null,
): ClickUpOAuthStatePayload {
  const [payloadB64, sigB64] = state.split(".");
  if (!payloadB64 || !sigB64) throw new Error("Invalid OAuth state");
  const expected = createHmac("sha256", stateSecret(secretFallback))
    .update(payloadB64)
    .digest();
  const actual = fromB64url(sigB64);
  if (
    expected.length !== actual.length ||
    !timingSafeEqual(expected, actual)
  ) {
    throw new Error("Invalid OAuth state signature");
  }
  const body = JSON.parse(
    fromB64url(payloadB64).toString("utf8"),
  ) as ClickUpOAuthStatePayload;
  if (!body.orgId || !body.profileId || !body.purpose) {
    throw new Error("Invalid OAuth state payload");
  }
  if (!body.workspaceSlug) body.workspaceSlug = "";
  if (body.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("OAuth state expired — try Connect again");
  }
  return body;
}

export function clickUpAuthorizeUrl(args: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const u = new URL("https://app.clickup.com/api");
  u.searchParams.set("client_id", args.clientId);
  u.searchParams.set("redirect_uri", args.redirectUri);
  u.searchParams.set("state", args.state);
  return u.toString();
}

export function oauthRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/addons/clickup/oauth/callback`;
}
