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
 * Synced project ids + ClickUp folder URLs (empty when addon off / demo).
 */
export function useClickUpSyncedProjectIds(): {
  syncedIds: Set<string>;
  /** projectId → ClickUp folder overview URL when link + team are known. */
  syncedHrefs: Map<string, string>;
  ready: boolean;
  refresh: () => void;
} {
  const [syncedIds, setSyncedIds] = useState<Set<string>>(() => new Set());
  const [syncedHrefs, setSyncedHrefs] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => {
    void (async () => {
      try {
        const res = await fetch("/api/addons/clickup/synced-projects");
        if (!res.ok) {
          setSyncedIds(new Set());
          setSyncedHrefs(new Map());
          setReady(true);
          return;
        }
        const json = (await res.json()) as {
          projectIds?: string[];
          links?: Record<string, string>;
        };
        setSyncedIds(new Set(json.projectIds ?? []));
        setSyncedHrefs(new Map(Object.entries(json.links ?? {})));
        setReady(true);
      } catch {
        setSyncedIds(new Set());
        setSyncedHrefs(new Map());
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

  return { syncedIds, syncedHrefs, ready, refresh };
}
