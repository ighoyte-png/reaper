import {
  dedupeProfileIds,
  type EmitNotificationInput,
  type NotificationRow,
} from "@/lib/domain/notifications";

/** Build in-memory feed rows for demo mode (no push). */
export function buildDemoNotificationRows(
  input: EmitNotificationInput,
): NotificationRow[] {
  const recipients = dedupeProfileIds(input.recipientProfileIds);
  const now = new Date().toISOString();
  return recipients.map((recipientProfileId) => ({
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `demo-notif-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    organization_id: input.organizationId,
    recipient_profile_id: recipientProfileId,
    kind: input.kind,
    title: input.title,
    body: input.body ?? "",
    href: input.href ?? "/",
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    actor_person_id: input.actorPersonId ?? null,
    read_at: null,
    created_at: now,
  }));
}

/**
 * Fire-and-forget client emit → durable feed + Web Push.
 * Safe to call from the browser store; failures are logged only.
 */
export function emitNotificationClient(
  input: EmitNotificationInput,
): void {
  if (typeof window === "undefined") return;
  const recipients = input.recipientProfileIds.filter(Boolean);
  if (recipients.length === 0) return;

  void fetch("/api/notifications/emit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      ...input,
      recipientProfileIds: recipients,
    }),
  }).catch((err) => {
    console.warn("emitNotificationClient failed", err);
  });
}
