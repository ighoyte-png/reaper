"use client";

import { useCallback, useEffect, useState } from "react";

/** Fired after project ClickUp sync is toggled so badges can refresh. */
export const CLICKUP_PROJECT_SYNC_CHANGED_EVENT =
  "reaper-clickup-project-sync-changed";

export function notifyClickUpProjectSyncChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CLICKUP_PROJECT_SYNC_CHANGED_EVENT));
}

/**
 * Set of project ids with ClickUp sync enabled (empty when addon off / demo).
 */
export function useClickUpSyncedProjectIds(): {
  syncedIds: Set<string>;
  ready: boolean;
  refresh: () => void;
} {
  const [syncedIds, setSyncedIds] = useState<Set<string>>(() => new Set());
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => {
    void (async () => {
      try {
        const res = await fetch("/api/addons/clickup/synced-projects");
        if (!res.ok) {
          setSyncedIds(new Set());
          setReady(true);
          return;
        }
        const json = (await res.json()) as { projectIds?: string[] };
        setSyncedIds(new Set(json.projectIds ?? []));
        setReady(true);
      } catch {
        setSyncedIds(new Set());
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    refresh();
    function onChange() {
      refresh();
    }
    window.addEventListener(CLICKUP_PROJECT_SYNC_CHANGED_EVENT, onChange);
    window.addEventListener("focus", onChange);
    return () => {
      window.removeEventListener(CLICKUP_PROJECT_SYNC_CHANGED_EVENT, onChange);
      window.removeEventListener("focus", onChange);
    };
  }, [refresh]);

  return { syncedIds, ready, refresh };
}
