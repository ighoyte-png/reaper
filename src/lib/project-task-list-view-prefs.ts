"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProjectListViewPrefs } from "@/lib/domain/tasks";

export const DEFAULT_PROJECT_TASK_LIST_VIEW_PREFS: ProjectListViewPrefs = {
  hideCompleted: false,
  completedToBottom: false,
};

/** Dispatched after prefs are written so other mounts can re-read. */
export const PROJECT_TASK_LIST_VIEW_PREFS_EVENT =
  "reaper-project-task-list-view-prefs";

function storageKey(profileId: string, projectId: string) {
  return `reaper-project-task-list-view:${profileId}:${projectId}`;
}

function isBool(value: unknown): value is boolean {
  return value === true || value === false;
}

export function readProjectTaskListViewPrefs(
  profileId: string | null | undefined,
  projectId: string | null | undefined,
): ProjectListViewPrefs {
  if (!profileId || !projectId || typeof window === "undefined") {
    return { ...DEFAULT_PROJECT_TASK_LIST_VIEW_PREFS };
  }
  try {
    const raw = localStorage.getItem(storageKey(profileId, projectId));
    if (!raw) return { ...DEFAULT_PROJECT_TASK_LIST_VIEW_PREFS };
    const parsed = JSON.parse(raw) as Partial<ProjectListViewPrefs>;
    return {
      hideCompleted: isBool(parsed.hideCompleted)
        ? parsed.hideCompleted
        : DEFAULT_PROJECT_TASK_LIST_VIEW_PREFS.hideCompleted,
      completedToBottom: isBool(parsed.completedToBottom)
        ? parsed.completedToBottom
        : DEFAULT_PROJECT_TASK_LIST_VIEW_PREFS.completedToBottom,
    };
  } catch {
    return { ...DEFAULT_PROJECT_TASK_LIST_VIEW_PREFS };
  }
}

export function writeProjectTaskListViewPrefs(
  profileId: string | null | undefined,
  projectId: string | null | undefined,
  prefs: ProjectListViewPrefs,
): void {
  if (!profileId || !projectId || typeof window === "undefined") return;
  try {
    localStorage.setItem(
      storageKey(profileId, projectId),
      JSON.stringify(prefs),
    );
    window.dispatchEvent(new Event(PROJECT_TASK_LIST_VIEW_PREFS_EVENT));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Live prefs for the project task board — restores last view per user+project. */
export function useProjectTaskListViewPrefs(
  profileId: string | null | undefined,
  projectId: string | null | undefined,
) {
  const [prefs, setPrefsState] = useState<ProjectListViewPrefs>(
    DEFAULT_PROJECT_TASK_LIST_VIEW_PREFS,
  );

  useEffect(() => {
    function sync() {
      setPrefsState(readProjectTaskListViewPrefs(profileId, projectId));
    }
    sync();
    window.addEventListener(PROJECT_TASK_LIST_VIEW_PREFS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(PROJECT_TASK_LIST_VIEW_PREFS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [profileId, projectId]);

  const setPrefs = useCallback(
    (
      next:
        | ProjectListViewPrefs
        | ((prev: ProjectListViewPrefs) => ProjectListViewPrefs),
    ) => {
      setPrefsState((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        writeProjectTaskListViewPrefs(profileId, projectId, resolved);
        return resolved;
      });
    },
    [profileId, projectId],
  );

  return { prefs, setPrefs };
}
