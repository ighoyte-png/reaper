/** Opaque share token for public read-only org links. */
export function generateShareToken(): string {
  if (typeof crypto === "undefined" || typeof crypto.getRandomValues !== "function") {
    throw new Error("Secure random token generation is unavailable");
  }
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function publicShareUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/share/${token}`;
}

/** Per-project client portal link (separate token space from org share). */
export function publicProjectShareUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/share/project/${token}`;
}

/** Browser origin for share links; falls back when called during SSR. */
export function clientSiteOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin;
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (raw) {
    try {
      const origin = new URL(raw).origin;
      if (
        !origin.includes("localhost") &&
        !origin.includes("127.0.0.1")
      ) {
        return origin;
      }
    } catch {
      /* fall through */
    }
  }
  return "https://app.reaperpm.com";
}
