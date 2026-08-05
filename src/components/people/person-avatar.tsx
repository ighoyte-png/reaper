"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import {
  invalidateAttachmentDisplayUrl,
  resolveAttachmentDisplayUrl,
} from "@/lib/storage/client-upload";

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

/** Re-sign before typical 1h R2 URL expiry while the avatar stays mounted. */
const REFRESH_MS = 40 * 60 * 1000;

export function PersonAvatar({
  avatarUrl,
  avatarAttachmentId,
  name,
  className,
  size = "md",
  fallback = "initials",
  title,
  color,
}: {
  avatarUrl: string | null | undefined;
  /** Durable R2 attachment id — preferred over expired signed avatarUrl. */
  avatarAttachmentId?: string | null;
  name?: string;
  className?: string;
  size?: keyof typeof SIZE_CLASS;
  /** initials = letter circle when no photo (default). hidden = render nothing. */
  fallback?: "hidden" | "initials";
  title?: string;
  /** Initials circle background (client palette hex). */
  color?: string | null;
}) {
  const [displayUrl, setDisplayUrl] = useState<string | null>(
    avatarUrl ?? null,
  );
  const [imageFailed, setImageFailed] = useState(false);
  const retryingRef = useRef(false);
  const sizeClass = SIZE_CLASS[size];
  const label = name?.trim() || "";
  const attachmentId = avatarAttachmentId?.trim() || null;

  useEffect(() => {
    setImageFailed(false);
    retryingRef.current = false;

    if (!attachmentId) {
      setDisplayUrl(avatarUrl ?? null);
      return;
    }

    let cancelled = false;
    const load = async (force: boolean) => {
      if (force) invalidateAttachmentDisplayUrl(attachmentId);
      const url = await resolveAttachmentDisplayUrl(attachmentId);
      if (cancelled) return;
      setDisplayUrl(url ?? avatarUrl ?? null);
      if (url) setImageFailed(false);
    };

    void load(false);
    const timer = window.setInterval(() => {
      void load(true);
    }, REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [attachmentId, avatarUrl]);

  const showPhoto = Boolean(displayUrl) && !imageFailed;

  if (showPhoto) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={displayUrl!}
        alt={label ? `${label} photo` : "Person photo"}
        title={title ?? (label || undefined)}
        onError={() => {
          if (attachmentId && !retryingRef.current) {
            retryingRef.current = true;
            invalidateAttachmentDisplayUrl(attachmentId);
            void resolveAttachmentDisplayUrl(attachmentId).then((url) => {
              if (url) {
                setDisplayUrl(url);
                setImageFailed(false);
                retryingRef.current = false;
              } else {
                setImageFailed(true);
              }
            });
            return;
          }
          setImageFailed(true);
        }}
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
