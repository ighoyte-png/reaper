"use client";

import { useEffect } from "react";

const DEFAULT_APP_NAME = "Reaper";

/**
 * Sets the browser tab title to `View · {appName}`.
 * Pass `undefined` to leave the current title unchanged (e.g. nested breadcrumbs).
 * Pass `null` or `""` to reset to `{appName}` (default Reaper).
 */
export function useDocumentTitle(
  title: string | null | undefined,
  appName: string | null | undefined = DEFAULT_APP_NAME,
) {
  useEffect(() => {
    if (title === undefined) return;
    const brand = (appName ?? "").trim() || DEFAULT_APP_NAME;
    const trimmed = (title ?? "").trim();
    document.title = trimmed ? `${trimmed} · ${brand}` : brand;
  }, [title, appName]);
}
