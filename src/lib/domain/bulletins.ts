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
 * Unread bulletin for this viewer (excludes posts they authored).
 * `unread` is the inbox set — ids present there are still "new".
 * Manage roles without a linked person still see `audience: "all"` alerts
 * the same way admins with a person link do.
 */
export function isUnreadBulletin(
  bulletin: Bulletin,
  personId: string | null,
  profileId: string | null,
  unread: Set<string>,
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
  return unread.has(bulletin.id);
}

/** Profile ids that should get an unread row for a new bulletin. */
export function bulletinUnreadRecipientProfileIds(
  bulletin: Bulletin,
  people: { id: string; profile_id: string | null }[],
  profiles: { id: string }[],
): string[] {
  const author = bulletin.created_by_profile_id;
  if (bulletin.audience === "people") {
    const wanted = new Set(bulletin.audience_person_ids);
    return people
      .filter((p) => wanted.has(p.id) && p.profile_id && p.profile_id !== author)
      .map((p) => p.profile_id!)
      .filter((id, i, arr) => arr.indexOf(id) === i);
  }
  return profiles
    .map((p) => p.id)
    .filter((id) => id !== author);
}

/** Legacy localStorage keys for bulletin dismissals (pre-unread inbox). */
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

/** Legacy localStorage dismissed mention comment ids. */
export function readLegacyDismissedMentionIds(personId: string | null): string[] {
  if (typeof window === "undefined" || !personId) return [];
  try {
    const raw = localStorage.getItem(`reaper-dismissed-mentions:${personId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

export function clearLegacyDismissedMentionIds(personId: string | null) {
  if (typeof window === "undefined" || !personId) return;
  try {
    localStorage.removeItem(`reaper-dismissed-mentions:${personId}`);
  } catch {
    /* ignore */
  }
}
