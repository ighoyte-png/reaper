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

/** localStorage subject for bulletin dismissals (person id or profile fallback). */
export function bulletinDismissSubject(
  personId: string | null,
  profileId: string | null,
  canManage: boolean,
): string | null {
  if (personId) return personId;
  if (canManage && profileId) return `profile:${profileId}`;
  return null;
}
