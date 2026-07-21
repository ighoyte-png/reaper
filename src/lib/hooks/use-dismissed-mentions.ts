"use client";

import { useCallback, useEffect, useState } from "react";

function storageKey(personId: string) {
  return `reaper-dismissed-mentions:${personId}`;
}

function readIds(personId: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(personId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

function writeIds(personId: string, ids: string[]) {
  try {
    localStorage.setItem(storageKey(personId), JSON.stringify(ids));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Persist dismissed @mention comment ids for a person (local to this browser). */
export function useDismissedMentions(personId: string | null) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!personId) {
      setDismissed(new Set());
      return;
    }
    setDismissed(new Set(readIds(personId)));
  }, [personId]);

  const dismiss = useCallback(
    (commentId: string) => {
      if (!personId) return;
      setDismissed((prev) => {
        const next = new Set(prev);
        next.add(commentId);
        writeIds(personId, [...next]);
        return next;
      });
    },
    [personId],
  );

  const isDismissed = useCallback(
    (commentId: string) => dismissed.has(commentId),
    [dismissed],
  );

  return { dismiss, isDismissed, dismissed };
}
