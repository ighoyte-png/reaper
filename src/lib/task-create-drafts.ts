import { notesHasContent } from "@/lib/notes-html";

const PREFIX = "reaper-task-create-draft:";

export type TaskCreateDraft = {
  title: string;
  assignee_person_id: string | null;
  start_date: string | null;
  due_date: string | null;
  notes: string;
};

type StoredTaskCreateDraft = TaskCreateDraft & { updatedAt: number };

function storageKey(profileId: string, listId: string) {
  return `${PREFIX}${profileId}:${listId}`;
}

export function taskCreateDraftHasContent(draft: TaskCreateDraft): boolean {
  return Boolean(
    draft.title.trim() ||
      draft.assignee_person_id ||
      draft.start_date ||
      draft.due_date ||
      notesHasContent(draft.notes),
  );
}

function parseStored(raw: string | null): StoredTaskCreateDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredTaskCreateDraft>;
    if (!parsed || typeof parsed !== "object") return null;
    const draft: StoredTaskCreateDraft = {
      title: typeof parsed.title === "string" ? parsed.title : "",
      assignee_person_id:
        typeof parsed.assignee_person_id === "string"
          ? parsed.assignee_person_id
          : null,
      start_date:
        typeof parsed.start_date === "string" ? parsed.start_date : null,
      due_date: typeof parsed.due_date === "string" ? parsed.due_date : null,
      notes: typeof parsed.notes === "string" ? parsed.notes : "",
      updatedAt:
        typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    };
    if (!taskCreateDraftHasContent(draft)) return null;
    return draft;
  } catch {
    return null;
  }
}

export function readTaskCreateDraft(
  profileId: string | null | undefined,
  listId: string,
): TaskCreateDraft | null {
  if (!profileId || typeof window === "undefined") return null;
  try {
    const stored = parseStored(localStorage.getItem(storageKey(profileId, listId)));
    if (!stored) return null;
    const { updatedAt: _u, ...draft } = stored;
    return draft;
  } catch {
    return null;
  }
}

/** Persist a create-task draft; clears when empty. */
export function writeTaskCreateDraft(
  profileId: string | null | undefined,
  listId: string,
  draft: TaskCreateDraft,
): void {
  if (!profileId || typeof window === "undefined") return;
  try {
    const key = storageKey(profileId, listId);
    if (!taskCreateDraftHasContent(draft)) {
      localStorage.removeItem(key);
      return;
    }
    const stored: StoredTaskCreateDraft = {
      ...draft,
      updatedAt: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(stored));
  } catch {
    // Quota / private mode — ignore.
  }
}

export function clearTaskCreateDraft(
  profileId: string | null | undefined,
  listId: string,
): void {
  if (!profileId || typeof window === "undefined") return;
  try {
    localStorage.removeItem(storageKey(profileId, listId));
  } catch {
    // ignore
  }
}

/** List create drafts for a profile, newest first. */
export function listTaskCreateDrafts(
  profileId: string | null | undefined,
): { listId: string; updatedAt: number }[] {
  if (!profileId || typeof window === "undefined") return [];
  const needle = `${PREFIX}${profileId}:`;
  const out: { listId: string; updatedAt: number }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith(needle)) continue;
      const listId = key.slice(needle.length);
      if (!listId) continue;
      const stored = parseStored(localStorage.getItem(key));
      if (!stored) continue;
      out.push({ listId, updatedAt: stored.updatedAt });
    }
  } catch {
    return [];
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}
