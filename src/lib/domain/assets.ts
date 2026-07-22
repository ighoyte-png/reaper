import type { ProjectAssetKind } from "@/lib/types";

export const ASSET_KIND_LABELS: Record<ProjectAssetKind, string> = {
  sow: "SOW / Contract",
  website: "Existing website",
  figma: "Figma",
  content: "Content docs",
  staging: "Staging",
  passwords: "Passwords",
  drive: "Google Drive",
  chat: "Chat",
  spreadsheet: "Spreadsheet",
  document: "Document",
  custom: "Custom",
};

export function inferAssetKind(url: string): ProjectAssetKind {
  const u = url.toLowerCase();
  if (u.includes("figma.com")) return "figma";
  if (u.includes("drive.google.com") || u.includes("docs.google.com"))
    return "drive";
  if (u.includes("sheets.google.com") || u.includes("excel") || u.endsWith(".xlsx") || u.endsWith(".csv"))
    return "spreadsheet";
  if (u.includes("docs.google.com/document") || u.endsWith(".docx") || u.endsWith(".pdf"))
    return "document";
  if (
    u.includes("slack.com") ||
    u.includes("teams.microsoft.com") ||
    u.includes("chat.google.com") ||
    u.includes("discord.com")
  )
    return "chat";
  if (u.includes("1password") || u.includes("lastpass") || u.includes("bitwarden"))
    return "passwords";
  if (u.includes("staging") || u.includes("vercel.app") || u.includes("netlify"))
    return "staging";
  return "custom";
}
