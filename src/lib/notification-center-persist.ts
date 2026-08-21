import type { MentionTarget } from "@/lib/types";

export type PersistedNotificationKind =
  | "mention"
  | "bulletin"
  | "in_review"
  | "message"
  | "assigned";

export type PersistedNotificationCard = {
  id: string;
  kind: PersistedNotificationKind;
  href: string;
  title: string;
  subtitle: string;
  clientName?: string | null;
  clientColor?: string | null;
  enqueuedAt: number;
  read: boolean;
  mentionTarget?: MentionTarget;
  bulletinId?: string;
  taskId?: string;
  commentId?: string;
};

const KINDS = new Set<PersistedNotificationKind>([
  "mention",
  "bulletin",
  "in_review",
  "message",
  "assigned",
]);

/** localStorage key for notification-center cards (per org + profile + person). */
export function notificationCenterStorageKey(
  orgId: string,
  profileId: string,
  personId: string,
): string {
  return `reaper-nc-cards:${orgId}:${profileId}:${personId}`;
}

function isMentionTarget(value: unknown): value is MentionTarget {
  if (!value || typeof value !== "object") return false;
  const t = value as { kind?: unknown; id?: unknown };
  return (
    (t.kind === "comment" ||
      t.kind === "task" ||
      t.kind === "assignment") &&
    typeof t.id === "string" &&
    t.id.length > 0
  );
}

function parseCard(raw: unknown): PersistedNotificationCard | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.id !== "string" || !c.id) return null;
  if (
    typeof c.kind !== "string" ||
    !KINDS.has(c.kind as PersistedNotificationKind)
  ) {
    return null;
  }
  if (typeof c.href !== "string") return null;
  if (typeof c.title !== "string") return null;
  if (typeof c.subtitle !== "string") return null;
  if (typeof c.enqueuedAt !== "number" || !Number.isFinite(c.enqueuedAt)) {
    return null;
  }
  const mentionTarget =
    c.mentionTarget !== undefined && isMentionTarget(c.mentionTarget)
      ? c.mentionTarget
      : undefined;
  return {
    id: c.id,
    kind: c.kind as PersistedNotificationKind,
    href: c.href,
    title: c.title,
    subtitle: c.subtitle,
    clientName:
      typeof c.clientName === "string"
        ? c.clientName
        : c.clientName === null
          ? null
          : undefined,
    clientColor:
      typeof c.clientColor === "string"
        ? c.clientColor
        : c.clientColor === null
          ? null
          : undefined,
    enqueuedAt: c.enqueuedAt,
    read: Boolean(c.read),
    mentionTarget,
    bulletinId: typeof c.bulletinId === "string" ? c.bulletinId : undefined,
    taskId: typeof c.taskId === "string" ? c.taskId : undefined,
    commentId: typeof c.commentId === "string" ? c.commentId : undefined,
  };
}

export function readNotificationCenterCards(
  storageKey: string,
): PersistedNotificationCard[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: PersistedNotificationCard[] = [];
    for (const item of parsed) {
      const card = parseCard(item);
      if (card) out.push(card);
    }
    return out;
  } catch {
    return [];
  }
}

export function writeNotificationCenterCards(
  storageKey: string,
  cards: PersistedNotificationCard[],
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(cards));
  } catch {
    // Quota / private mode — ignore
  }
}

export function clearNotificationCenterCards(storageKey: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // ignore
  }
}
