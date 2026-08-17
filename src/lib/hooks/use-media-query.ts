"use client";

import { useEffect, useState } from "react";

/** Tailwind `md` — phones only; tablets keep the existing 1023px `isNarrow` path. */
export const PHONE_MEDIA_QUERY = "(max-width: 767px)";

/** True when viewport is below the given Tailwind-like breakpoint (px). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);

  return matches;
}

/** True below 768px (phone). Tablets and desktop are false. */
export function useIsPhone(): boolean {
  return useMediaQuery(PHONE_MEDIA_QUERY);
}
