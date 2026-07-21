"use client";

import { useCallback, useEffect, useState } from "react";

function storageKey(personId: string) {
  return `reaper-dismissed-mentions:${personId}`;
}

const CHANGE_EVENT = "reaper-dismissed-mentions-changed";

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
    window.dispatchEvent(
      new CustomEvent(CHANGE_EVENT, { detail: { personId } }),
    );
  } catch {
    /* ignore quota / private mode */
  }
}

/** Persist dismissed @mention comment ids for a person (local to this browser). */
export function useDismissedMentions(personId: string | null) {
  const [dismissed, setDismissed] = useState<Set<string>>(() =>
    personId ? new Set(readIds(personId)) : new Set(),
  );

  useEffect(() => {
    if (!personId) {
      setDismissed(new Set());
      return;
    }

    function reload() {
      setDismissed(new Set(readIds(personId!)));
    }

    reload();

    function onLocalChange(e: Event) {
      const detail = (e as CustomEvent<{ personId?: string }>).detail;
      if (detail?.personId && detail.personId !== personId) return;
      reload();
    }

    function onStorage(e: StorageEvent) {
      if (e.key && e.key !== storageKey(personId!)) return;
      reload();
    }

    window.addEventListener(CHANGE_EVENT, onLocalChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onLocalChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [personId]);

  const dismiss = useCallback(
    (commentId: string) => {
      if (!personId) return;
      const next = new Set(readIds(personId));
      next.add(commentId);
      writeIds(personId, [...next]);
      setDismissed(next);
    },
    [personId],
  );

  const isDismissed = useCallback(
    (commentId: string) => dismissed.has(commentId),
    [dismissed],
  );

  return { dismiss, isDismissed, dismissed };
}
