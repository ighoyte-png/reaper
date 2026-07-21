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

/** Undismissed bulletin for this person (excludes posts they authored). */
export function isUnreadBulletin(
  bulletin: Bulletin,
  personId: string | null,
  profileId: string | null,
  dismissed: Set<string>,
): boolean {
  if (!personId) return false;
  if (!bulletinVisibleToPerson(bulletin, personId)) return false;
  if (profileId && bulletin.created_by_profile_id === profileId) return false;
  if (dismissed.has(bulletin.id)) return false;
  return true;
}
