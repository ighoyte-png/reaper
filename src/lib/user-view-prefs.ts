"use client";

import { useCallback, useEffect, useState } from "react";
import { primaryNavLinks } from "@/components/nav/nav-links";
import { shiftWeek, weekStart } from "@/lib/domain/dates";

export type DefaultStartPage =
  | "/dashboard"
  | "/schedule"
  | "/projects"
  | "/reports"
  | "/clients"
  | "/people";

export type ScheduleViewOffset = "none" | "one_week" | "two_weeks";

export type UserViewPrefs = {
  defaultStartPage: DefaultStartPage;
  scheduleViewOffset: ScheduleViewOffset;
};

export const DEFAULT_USER_VIEW_PREFS: UserViewPrefs = {
  defaultStartPage: "/dashboard",
  scheduleViewOffset: "none",
};

export const SCHEDULE_VIEW_OFFSET_OPTIONS: {
  value: ScheduleViewOffset;
  label: string;
}[] = [
  { value: "none", label: "None" },
  { value: "one_week", label: "One Week" },
  { value: "two_weeks", label: "Two Weeks" },
];

const START_PAGE_VALUES = new Set<string>(
  primaryNavLinks.map((l) => l.href),
);

function storageKey(profileId: string) {
  return `reaper-view-prefs:${profileId}`;
}

function isDefaultStartPage(value: unknown): value is DefaultStartPage {
  return typeof value === "string" && START_PAGE_VALUES.has(value);
}

function isScheduleViewOffset(value: unknown): value is ScheduleViewOffset {
  return (
    value === "none" || value === "one_week" || value === "two_weeks"
  );
}

export function readUserViewPrefs(profileId: string | null | undefined): UserViewPrefs {
  if (!profileId || typeof window === "undefined") {
    return { ...DEFAULT_USER_VIEW_PREFS };
  }
  try {
    const raw = localStorage.getItem(storageKey(profileId));
    if (!raw) return { ...DEFAULT_USER_VIEW_PREFS };
    const parsed = JSON.parse(raw) as Partial<UserViewPrefs>;
    return {
      defaultStartPage: isDefaultStartPage(parsed.defaultStartPage)
        ? parsed.defaultStartPage
        : DEFAULT_USER_VIEW_PREFS.defaultStartPage,
      scheduleViewOffset: isScheduleViewOffset(parsed.scheduleViewOffset)
        ? parsed.scheduleViewOffset
        : DEFAULT_USER_VIEW_PREFS.scheduleViewOffset,
    };
  } catch {
    return { ...DEFAULT_USER_VIEW_PREFS };
  }
}

export function writeUserViewPrefs(
  profileId: string,
  prefs: UserViewPrefs,
): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey(profileId), JSON.stringify(prefs));
}

/** Start pages the user is allowed to land on given manage access. */
export function startPageOptions(canManage: boolean): {
  value: DefaultStartPage;
  label: string;
}[] {
  return primaryNavLinks
    .filter((l) => canManage || !l.manageOnly)
    .map((l) => ({
      value: l.href as DefaultStartPage,
      label: l.label,
    }));
}

export function resolveDefaultStartPage(
  page: DefaultStartPage,
  canManage: boolean,
): DefaultStartPage {
  const allowed = startPageOptions(canManage).some((o) => o.value === page);
  return allowed ? page : "/dashboard";
}

export function scheduleAnchorForOffset(offset: ScheduleViewOffset): Date {
  const base = weekStart(new Date());
  if (offset === "one_week") return shiftWeek(base, -1);
  if (offset === "two_weeks") return shiftWeek(base, -2);
  return base;
}

export function useUserViewPrefs(profileId: string | null | undefined) {
  const [prefs, setPrefsState] = useState<UserViewPrefs>(DEFAULT_USER_VIEW_PREFS);

  useEffect(() => {
    setPrefsState(readUserViewPrefs(profileId));
  }, [profileId]);

  /** Update in-memory draft only — call savePrefs to persist. */
  const setPrefs = useCallback(
    (next: UserViewPrefs | ((prev: UserViewPrefs) => UserViewPrefs)) => {
      setPrefsState((prev) =>
        typeof next === "function" ? next(prev) : next,
      );
    },
    [],
  );

  const savePrefs = useCallback(() => {
    if (!profileId) return;
    writeUserViewPrefs(profileId, prefs);
  }, [profileId, prefs]);

  return { prefs, setPrefs, savePrefs };
}
