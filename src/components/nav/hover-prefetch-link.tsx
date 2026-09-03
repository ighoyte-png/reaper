"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ComponentProps,
  type FocusEvent,
  type MouseEvent,
  type TouchEvent,
  useCallback,
} from "react";

type Props = ComponentProps<typeof Link>;

function hrefToPrefetchUrl(href: Props["href"]): string | null {
  if (typeof href === "string") return href;
  if (!href?.pathname) return null;
  return `${href.pathname}${href.search ?? ""}${href.hash ?? ""}`;
}

/**
 * Like next/link but skips viewport prefetch; warms the route on hover / focus / touch.
 * Use on dense nav (primary links, favorite tabs) to cut RSC + proxy CPU.
 */
export function HoverPrefetchLink({
  href,
  onMouseEnter,
  onFocus,
  onTouchStart,
  ...rest
}: Props) {
  const router = useRouter();

  const warm = useCallback(() => {
    const url = hrefToPrefetchUrl(href);
    if (url) router.prefetch(url);
  }, [href, router]);

  return (
    <Link
      {...rest}
      href={href}
      prefetch={false}
      onMouseEnter={(e: MouseEvent<HTMLAnchorElement>) => {
        warm();
        onMouseEnter?.(e);
      }}
      onFocus={(e: FocusEvent<HTMLAnchorElement>) => {
        warm();
        onFocus?.(e);
      }}
      onTouchStart={(e: TouchEvent<HTMLAnchorElement>) => {
        warm();
        onTouchStart?.(e);
      }}
    />
  );
}
