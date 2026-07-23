import type { Bulletin } from "@/lib/types";

/** Whether a bulletin is visible to a given person (audience rules). */
export function bulletinVisibleToPerson(
  bulletin: Bulletin,
  personId: string | null,
): boolean {
  if (bulletin.audience === "all") return true;
  if (!personId) return false;
  return bulletin.audience_person_ids.includes(personId);
}

/**
 * Undismissed bulletin for this viewer (excludes posts they authored).
 * Manage roles without a linked person still see `audience: "all"` alerts
 * the same way admins with a person link do.
 */
export function isUnreadBulletin(
  bulletin: Bulletin,
  personId: string | null,
  profileId: string | null,
  dismissed: Set<string>,
  opts?: { manageWithoutPerson?: boolean },
): boolean {
  const manageAll =
    Boolean(opts?.manageWithoutPerson) && bulletin.audience === "all";
  if (personId) {
    if (!bulletinVisibleToPerson(bulletin, personId)) return false;
  } else if (!manageAll) {
    return false;
  }
  if (profileId && bulletin.created_by_profile_id === profileId) return false;
  if (dismissed.has(bulletin.id)) return false;
  return true;
}

/**
 * Legacy localStorage keys used before dismissals moved to the database.
 * Used once to migrate existing browser dismissals into bulletin_dismissals.
 */
export function legacyBulletinDismissStorageKeys(
  personId: string | null,
  profileId: string | null,
): string[] {
  const keys: string[] = [];
  if (personId) keys.push(`reaper-dismissed-bulletins:${personId}`);
  if (profileId) {
    keys.push(`reaper-dismissed-bulletins:profile:${profileId}`);
    keys.push(`reaper-dismissed-bulletins:${profileId}`);
  }
  return keys;
}

/** Read dismissed bulletin ids from legacy localStorage keys (browser-only). */
export function readLegacyDismissedBulletinIds(
  personId: string | null,
  profileId: string | null,
): string[] {
  if (typeof window === "undefined") return [];
  const ids = new Set<string>();
  for (const key of legacyBulletinDismissStorageKeys(personId, profileId)) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) continue;
      for (const id of parsed) {
        if (typeof id === "string" && id) ids.add(id);
      }
    } catch {
      /* ignore */
    }
  }
  return [...ids];
}

/** Clear legacy localStorage keys after a successful DB migration. */
export function clearLegacyDismissedBulletinIds(
  personId: string | null,
  profileId: string | null,
) {
  if (typeof window === "undefined") return;
  for (const key of legacyBulletinDismissStorageKeys(personId, profileId)) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}
