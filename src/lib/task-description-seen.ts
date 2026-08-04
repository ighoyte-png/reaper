const PREFIX = "reaper-task-desc-seen:";

function storageKey(profileId: string, taskId: string) {
  return `${PREFIX}${profileId}:${taskId}`;
}

export function readTaskDescriptionSeen(
  profileId: string | null | undefined,
  taskId: string,
): boolean {
  if (!profileId || typeof window === "undefined") return false;
  try {
    return localStorage.getItem(storageKey(profileId, taskId)) === "1";
  } catch {
    return false;
  }
}

export function markTaskDescriptionSeen(
  profileId: string | null | undefined,
  taskId: string,
): void {
  if (!profileId || typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(profileId, taskId), "1");
  } catch {
    // Quota / private mode — ignore.
  }
}
