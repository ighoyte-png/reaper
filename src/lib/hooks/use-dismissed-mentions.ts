"use client";

import { useCallback, useEffect, useState } from "react";

type DismissKind = "mentions";

function storageKey(kind: DismissKind, personId: string) {
  return `reaper-dismissed-mentions:${personId}`;
}

const CHANGE_EVENT = "reaper-dismissed-ids-changed";

function readIds(kind: DismissKind, personId: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(kind, personId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

function writeIds(kind: DismissKind, personId: string, ids: string[]) {
  try {
    localStorage.setItem(storageKey(kind, personId), JSON.stringify(ids));
    window.dispatchEvent(
      new CustomEvent(CHANGE_EVENT, { detail: { kind, personId } }),
    );
  } catch {
    /* ignore quota / private mode */
  }
}

function useDismissedIds(kind: DismissKind, personId: string | null) {
  const [dismissed, setDismissed] = useState<Set<string>>(() =>
    personId ? new Set(readIds(kind, personId)) : new Set(),
  );

  useEffect(() => {
    if (!personId) {
      setDismissed(new Set());
      return;
    }

    function reload() {
      setDismissed(new Set(readIds(kind, personId!)));
    }

    reload();

    function onLocalChange(e: Event) {
      const detail = (e as CustomEvent<{ kind?: DismissKind; personId?: string }>)
        .detail;
      if (detail?.kind && detail.kind !== kind) return;
      if (detail?.personId && detail.personId !== personId) return;
      reload();
    }

    function onStorage(e: StorageEvent) {
      if (e.key && e.key !== storageKey(kind, personId!)) return;
      reload();
    }

    window.addEventListener(CHANGE_EVENT, onLocalChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onLocalChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [kind, personId]);

  const dismiss = useCallback(
    (id: string) => {
      if (!personId) return;
      const next = new Set(readIds(kind, personId));
      next.add(id);
      writeIds(kind, personId, [...next]);
      setDismissed(next);
    },
    [kind, personId],
  );

  const isDismissed = useCallback(
    (id: string) => dismissed.has(id),
    [dismissed],
  );

  return { dismiss, isDismissed, dismissed };
}

/** Persist dismissed @mention comment ids for a person (local to this browser). */
export function useDismissedMentions(personId: string | null) {
  return useDismissedIds("mentions", personId);
}
