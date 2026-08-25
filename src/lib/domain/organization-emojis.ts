import type { OrganizationEmoji } from "@/lib/types";

const EMOJI_NAME_RE = /^[a-z0-9_]{2,32}$/;

/** Slack-style handle without colons. */
export function isValidEmojiName(name: string): boolean {
  return EMOJI_NAME_RE.test(name);
}

/** Slug a filename into a valid emoji handle (editable afterward). */
export function slugifyEmojiName(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "");
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  if (slug.length >= 2) return slug;
  return "emoji";
}

/** Stable display/insert src — prefer demo data URL, else API route. */
export function organizationEmojiSrc(emoji: OrganizationEmoji): string {
  if (emoji.src) return emoji.src;
  return `/api/emojis/${encodeURIComponent(emoji.name)}`;
}
