"use client";

import { useData } from "@/lib/data/store";

/** Prefix app paths for the public share shell when needed. */
export function useAppHref(): (path: string) => string {
  const { shareBasePath } = useData();
  return (path: string) => {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    if (!shareBasePath) return normalized;
    return `${shareBasePath}${normalized}`;
  };
}
