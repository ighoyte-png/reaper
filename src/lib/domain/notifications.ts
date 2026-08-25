/** Server + client shared notification kinds (matches DB check constraint). */
export type NotificationKind =
  | "mention"
  | "message"
  | "assigned"
  | "bulletin"
  | "in_review"
  | "milestone_approved"
  | "reaction";

export type NotificationEntityType =
  | "task"
  | "comment"
  | "bulletin"
  | "assignment"
  | "milestone"
  | null;

export type NotificationRow = {
  id: string;
  organization_id: string;
  recipient_profile_id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string;
  entity_type: string | null;
  entity_id: string | null;
  actor_person_id: string | null;
  read_at: string | null;
  created_at: string;
};

export type EmitNotificationInput = {
  organizationId: string;
  recipientProfileIds: string[];
  kind: NotificationKind;
  title: string;
  body?: string;
  href?: string;
  entityType?: NotificationEntityType | string | null;
  entityId?: string | null;
  actorPersonId?: string | null;
};

export function dedupeProfileIds(
  ids: Array<string | null | undefined>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Stable OS / SW notification tag for coalescing. */
export function notificationTag(
  row: Pick<NotificationRow, "kind" | "entity_id" | "id">,
): string {
  if (row.entity_id) return `${row.kind}-${row.entity_id}`;
  return `notification-${row.id}`;
}

export function mapNotificationRowToCard(row: NotificationRow): {
  id: string;
  kind: NotificationKind;
  href: string;
  title: string;
  subtitle: string;
  enqueuedAt: number;
  visible: boolean;
  read: boolean;
  bulletinId?: string;
  taskId?: string;
  commentId?: string;
} {
  const card: {
    id: string;
    kind: NotificationKind;
    href: string;
    title: string;
    subtitle: string;
    enqueuedAt: number;
    visible: boolean;
    read: boolean;
    bulletinId?: string;
    taskId?: string;
    commentId?: string;
  } = {
    id: `feed:${row.id}`,
    kind: row.kind,
    href: row.href || "/",
    title: row.title,
    subtitle: row.body,
    enqueuedAt: Date.parse(row.created_at) || Date.now(),
    visible: true,
    read: Boolean(row.read_at),
  };
  if (row.entity_type === "bulletin" && row.entity_id) {
    card.bulletinId = row.entity_id;
  }
  if (row.entity_type === "task" && row.entity_id) {
    card.taskId = row.entity_id;
  }
  if (row.entity_type === "comment" && row.entity_id) {
    card.commentId = row.entity_id;
  }
  return card;
}
