"use client";

import { useCallback, useEffect, useState } from "react";

/** Dispatched after Utility Notifications pref is written so chrome can re-read. */
export const UTILITY_NOTIFICATIONS_PREF_EVENT =
  "reaper-utility-notifications-pref";

function storageKey(profileId: string) {
  return `reaper-utility-notifications:${profileId}`;
}

/** Default on when unset. */
export function readUtilityNotificationsPref(
  profileId: string | null | undefined,
): boolean {
  if (!profileId || typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(storageKey(profileId));
    if (raw === null) return true;
    return raw !== "0";
  } catch {
    return true;
  }
}

export function writeUtilityNotificationsPref(
  profileId: string,
  enabled: boolean,
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(profileId), enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(UTILITY_NOTIFICATIONS_PREF_EVENT));
}

export function useUtilityNotificationsPref(
  profileId: string | null | undefined,
): {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
  toggle: () => void;
} {
  const [enabled, setEnabledState] = useState(true);

  useEffect(() => {
    function sync() {
      setEnabledState(readUtilityNotificationsPref(profileId));
    }
    sync();
    window.addEventListener(UTILITY_NOTIFICATIONS_PREF_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(UTILITY_NOTIFICATIONS_PREF_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [profileId]);

  const setEnabled = useCallback(
    (next: boolean) => {
      if (!profileId) {
        setEnabledState(next);
        return;
      }
      writeUtilityNotificationsPref(profileId, next);
      setEnabledState(next);
    },
    [profileId],
  );

  const toggle = useCallback(() => {
    setEnabled(!enabled);
  }, [enabled, setEnabled]);

  return { enabled, setEnabled, toggle };
}
