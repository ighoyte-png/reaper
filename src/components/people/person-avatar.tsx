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
}: {
  avatarUrl: string | null | undefined;
  name?: string;
  className?: string;
  size?: keyof typeof SIZE_CLASS;
  /** initials = letter circle when no photo (default). hidden = render nothing. */
  fallback?: "hidden" | "initials";
  title?: string;
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

  return (
    <span
      title={title ?? label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--bg-elevated)] font-semibold text-[var(--text-muted)]",
        sizeClass,
        className,
      )}
    >
      {personInitials(label)}
    </span>
  );
}
