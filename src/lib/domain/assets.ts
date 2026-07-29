import type { ProjectAssetKind } from "@/lib/types";

/** Display labels — Title Case for UI titles and tooltips. */
export const ASSET_KIND_LABELS: Record<ProjectAssetKind, string> = {
  sow: "SOW / Contract",
  website: "Existing Website",
  figma: "Figma",
  content: "Content Docs",
  staging: "Staging",
  passwords: "Passwords",
  drive: "Google Drive",
  chat: "Chat",
  spreadsheet: "Spreadsheet",
  document: "Document",
  custom: "Custom",
};

/** Milestone edit Type picker — curated subset. */
export const MILESTONE_ESSENTIAL_KINDS: ProjectAssetKind[] = [
  "custom",
  "content",
  "figma",
  "staging",
  "spreadsheet",
  "document",
];

/** Kinds that copy Label/URL from an existing project Essentials link. */
export const MILESTONE_ESSENTIAL_PREFILL_KINDS: ReadonlySet<ProjectAssetKind> =
  new Set(["content", "figma", "staging"]);

/** Title-case words; keeps short ALL-CAPS tokens (e.g. SOW) intact. */
export function titleCaseWords(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (word === word.toUpperCase() && /[A-Z]/.test(word) && word.length <= 5) {
        return word;
      }
      if (word.includes("/")) {
        return word
          .split("/")
          .map((part) => titleCaseWords(part))
          .join(" / ");
      }
      return partTitle(word);
    })
    .join(" ");
}

function partTitle(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function assetKindLabel(kind: ProjectAssetKind): string {
  return ASSET_KIND_LABELS[kind] ?? ASSET_KIND_LABELS.custom;
}

/** Icon / link tooltip: Label first, else Type (both Title Case). */
export function assetTooltip(
  label: string | null | undefined,
  kind: ProjectAssetKind | null | undefined,
): string {
  const fromLabel = label?.trim();
  if (fromLabel) return titleCaseWords(fromLabel);
  if (kind) return assetKindLabel(kind);
  return "Custom";
}

/** Display title for an essentials row: Label first, else Type — Title Case. */
export function assetDisplayTitle(
  label: string | null | undefined,
  kind: ProjectAssetKind | null | undefined,
): string {
  return assetTooltip(label, kind);
}

export function sortedAssetKindOptions(
  kinds: readonly ProjectAssetKind[] = Object.keys(
    ASSET_KIND_LABELS,
  ) as ProjectAssetKind[],
): { value: ProjectAssetKind; label: string }[] {
  return [...kinds]
    .map((k) => ({ value: k, label: assetKindLabel(k) }))
    .sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
    );
}

export function inferAssetKind(url: string): ProjectAssetKind {
  const u = url.toLowerCase();
  if (u.includes("figma.com")) return "figma";
  if (u.includes("docs.google.com/spreadsheets") || u.includes("sheets.google.com"))
    return "spreadsheet";
  if (u.includes("docs.google.com/document")) return "document";
  if (u.includes("drive.google.com") || u.includes("docs.google.com"))
    return "drive";
  if (
    u.includes("excel") ||
    u.endsWith(".xlsx") ||
    u.endsWith(".xls") ||
    u.endsWith(".csv")
  )
    return "spreadsheet";
  if (u.endsWith(".docx") || u.endsWith(".doc") || u.endsWith(".pdf"))
    return "document";
  if (
    u.includes("slack.com") ||
    u.includes("teams.microsoft.com") ||
    u.includes("chat.google.com") ||
    u.includes("discord.com")
  )
    return "chat";
  if (
    u.includes("1password") ||
    u.includes("lastpass") ||
    u.includes("bitwarden")
  )
    return "passwords";
  if (
    u.includes("staging") ||
    u.includes("vercel.app") ||
    u.includes("netlify")
  )
    return "staging";
  return "custom";
}
