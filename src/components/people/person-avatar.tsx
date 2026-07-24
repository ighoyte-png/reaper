"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

function personInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function contrastText(hex: string): string {
  const raw = hex.replace("#", "");
  if (raw.length !== 6) return "#ffffff";
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#1a1a1a" : "#ffffff";
}

const SIZE_CLASS = {
  xs: "h-5 w-5 text-[9px]",
  team: "h-6 w-6 text-[10px]",
  row: "h-7 w-7 text-[10px]",
  sm: "h-8 w-8 text-[10px]",
  md: "h-12 w-12 text-xs",
  lg: "h-16 w-16 text-sm",
  xl: "h-24 w-24 text-base",
} as const;

export function PersonAvatar({
  avatarUrl,
  name,
  className,
  size = "md",
  fallback = "initials",
  title,
  color,
}: {
  avatarUrl: string | null | undefined;
  name?: string;
  className?: string;
  size?: keyof typeof SIZE_CLASS;
  /** initials = letter circle when no photo (default). hidden = render nothing. */
  fallback?: "hidden" | "initials";
  title?: string;
  /** Initials circle background (client palette hex). */
  color?: string | null;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const sizeClass = SIZE_CLASS[size];
  const label = name?.trim() || "";

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  const showPhoto = Boolean(avatarUrl) && !imageFailed;

  if (showPhoto) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl!}
        alt={label ? `${label} photo` : "Person photo"}
        title={title ?? (label || undefined)}
        onError={() => setImageFailed(true)}
        className={cn(
          "shrink-0 rounded-full object-cover bg-[var(--bg-elevated)]",
          sizeClass,
          className,
        )}
      />
    );
  }

  if (fallback === "hidden" || !label) return null;

  const bg = color?.trim() || undefined;
  return (
    <span
      title={title ?? label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        !bg && "bg-[var(--bg-elevated)] text-[var(--text-muted)]",
        sizeClass,
        className,
      )}
      style={
        bg ? { backgroundColor: bg, color: contrastText(bg) } : undefined
      }
    >
      {personInitials(label)}
    </span>
  );
}
