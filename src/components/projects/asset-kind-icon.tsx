"use client";

import {
  BookOpen,
  File,
  FileText,
  Globe,
  HardDrive,
  KeyRound,
  Layers,
  Link,
  MessageCircle,
  Server,
  Sheet,
  type LucideIcon,
} from "lucide-react";
import { assetKindLabel, assetTooltip } from "@/lib/domain/assets";
import type { ProjectAssetKind } from "@/lib/types";
import { cn } from "@/lib/cn";

const ASSET_KIND_ICONS: Record<ProjectAssetKind, LucideIcon> = {
  sow: FileText,
  website: Globe,
  figma: Layers,
  content: BookOpen,
  staging: Server,
  passwords: KeyRound,
  drive: HardDrive,
  chat: MessageCircle,
  spreadsheet: Sheet,
  document: File,
  custom: Link,
};

export function AssetKindIcon({
  kind,
  size = 14,
  className,
  /** Prefer Label; falls back to Type. Pass null to suppress native tooltip. */
  label,
  title,
}: {
  kind: ProjectAssetKind;
  size?: number;
  className?: string;
  label?: string | null;
  /** Override tooltip entirely; `null` hides title. */
  title?: string | null;
}) {
  const Icon = ASSET_KIND_ICONS[kind] ?? Link;
  const tip =
    title === null
      ? undefined
      : title !== undefined
        ? title
        : assetTooltip(label, kind);
  const sr = assetKindLabel(kind);
  return (
    <span
      title={tip}
      className={cn(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--bg-elevated)] text-[var(--text-muted)]",
        className,
      )}
    >
      <Icon size={size} aria-hidden />
      <span className="sr-only">{sr}</span>
    </span>
  );
}
