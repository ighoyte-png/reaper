import type { ProjectAssetKind } from "@/lib/types";

export const ASSET_KIND_LABELS: Record<ProjectAssetKind, string> = {
  sow: "SOW / Contract",
  website: "Existing website",
  figma: "Figma",
  content: "Content docs",
  staging: "Staging",
  passwords: "Passwords",
  drive: "Google Drive",
  custom: "Custom",
};

export function inferAssetKind(url: string): ProjectAssetKind {
  const u = url.toLowerCase();
  if (u.includes("figma.com")) return "figma";
  if (u.includes("drive.google.com") || u.includes("docs.google.com"))
    return "drive";
  if (u.includes("1password") || u.includes("lastpass") || u.includes("bitwarden"))
    return "passwords";
  if (u.includes("staging") || u.includes("vercel.app") || u.includes("netlify"))
    return "staging";
  return "custom";
}

export function assetIconLabel(kind: ProjectAssetKind): string {
  switch (kind) {
    case "sow":
      return "SOW";
    case "website":
      return "Web";
    case "figma":
      return "Fig";
    case "content":
      return "Doc";
    case "staging":
      return "Stg";
    case "passwords":
      return "Pwd";
    case "drive":
      return "Drv";
    case "custom":
      return "Link";
  }
}
