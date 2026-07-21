"use client";

import { useEffect } from "react";

const APP_NAME = "Reaper";

/**
 * Sets the browser tab title to `View · Reaper`.
 * Pass `undefined` to leave the current title unchanged (e.g. nested breadcrumbs).
 * Pass `null` or `""` to reset to `Reaper`.
 */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    if (title === undefined) return;
    const trimmed = (title ?? "").trim();
    document.title = trimmed ? `${trimmed} · ${APP_NAME}` : APP_NAME;
  }, [title]);
}
