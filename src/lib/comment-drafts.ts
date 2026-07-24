import { notesHasContent } from "@/lib/notes-html";

const PREFIX = "reaper-comment-draft:";

function storageKey(profileId: string, taskId: string) {
  return `${PREFIX}${profileId}:${taskId}`;
}

export function readCommentDraft(
  profileId: string | null | undefined,
  taskId: string,
): string {
  if (!profileId || typeof window === "undefined") return "";
  try {
    return localStorage.getItem(storageKey(profileId, taskId)) ?? "";
  } catch {
    return "";
  }
}

/** Persist a reply draft; clears the key when the body is empty. */
export function writeCommentDraft(
  profileId: string | null | undefined,
  taskId: string,
  html: string,
): void {
  if (!profileId || typeof window === "undefined") return;
  try {
    const key = storageKey(profileId, taskId);
    if (!notesHasContent(html)) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, html);
  } catch {
    // Quota / private mode — ignore.
  }
}

export function clearCommentDraft(
  profileId: string | null | undefined,
  taskId: string,
): void {
  if (!profileId || typeof window === "undefined") return;
  try {
    localStorage.removeItem(storageKey(profileId, taskId));
  } catch {
    // ignore
  }
}

/** Task ids that have a non-empty saved reply draft for this profile. */
export function taskIdsWithCommentDrafts(
  profileId: string | null | undefined,
): string[] {
  if (!profileId || typeof window === "undefined") return [];
  const needle = `${PREFIX}${profileId}:`;
  const ids: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith(needle)) continue;
      const taskId = key.slice(needle.length);
      if (!taskId) continue;
      const raw = localStorage.getItem(key);
      if (notesHasContent(raw)) ids.push(taskId);
    }
  } catch {
    return [];
  }
  return ids;
}
