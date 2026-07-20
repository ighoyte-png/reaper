"use client";

import { cn } from "@/lib/cn";

export function PersonAvatar({
  avatarUrl,
  name,
  className,
  size = "md",
}: {
  avatarUrl: string | null | undefined;
  name?: string;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  if (!avatarUrl) return null;

  const sizeClass =
    size === "sm"
      ? "h-8 w-8"
      : size === "lg"
        ? "h-16 w-16"
        : size === "xl"
          ? "h-24 w-24"
          : "h-12 w-12";

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl}
      alt={name ? `${name} photo` : "Person photo"}
      className={cn(
        "shrink-0 rounded-full object-cover bg-[var(--bg-elevated)]",
        sizeClass,
        className,
      )}
    />
  );
}
