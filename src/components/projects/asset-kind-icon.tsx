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
import { ASSET_KIND_LABELS } from "@/lib/domain/assets";
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
}: {
  kind: ProjectAssetKind;
  size?: number;
  className?: string;
}) {
  const Icon = ASSET_KIND_ICONS[kind] ?? Link;
  return (
    <span
      title={ASSET_KIND_LABELS[kind]}
      className={cn(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--bg-elevated)] text-[var(--text-muted)]",
        className,
      )}
    >
      <Icon size={size} aria-hidden />
      <span className="sr-only">{ASSET_KIND_LABELS[kind]}</span>
    </span>
  );
}
