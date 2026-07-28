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
