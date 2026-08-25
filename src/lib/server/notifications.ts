import { createAdminClient } from "@/lib/supabase/admin";
import {
  dedupeProfileIds,
  notificationTag,
  type EmitNotificationInput,
  type NotificationRow,
} from "@/lib/domain/notifications";
import webpush from "web-push";

function vapidConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
  );
}

function configureWebPush() {
  if (!vapidConfigured()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  return true;
}

/** Insert feed rows via security-definer RPC (service role). */
export async function insertNotificationRows(
  input: EmitNotificationInput,
): Promise<string[]> {
  const recipients = dedupeProfileIds(input.recipientProfileIds);
  if (recipients.length === 0) return [];

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("emit_notifications", {
    p_organization_id: input.organizationId,
    p_recipient_profile_ids: recipients,
    p_kind: input.kind,
    p_title: input.title,
    p_body: input.body ?? "",
    p_href: input.href ?? "/",
    p_entity_type: input.entityType ?? null,
    p_entity_id: input.entityId ?? null,
    p_actor_person_id: input.actorPersonId ?? null,
  });

  if (error) {
    console.warn("emit_notifications failed", error.message);
    return [];
  }
  return Array.isArray(data) ? (data as string[]) : [];
}

type PushSubRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  profile_id: string;
};

async function loadSubscriptions(
  profileIds: string[],
): Promise<PushSubRow[]> {
  if (profileIds.length === 0) return [];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, profile_id")
    .in("profile_id", profileIds);
  if (error) {
    console.warn("load push_subscriptions failed", error.message);
    return [];
  }
  return (data ?? []) as PushSubRow[];
}

async function deleteSubscriptionByEndpoint(endpoint: string) {
  try {
    const admin = createAdminClient();
    await admin.from("push_subscriptions").delete().eq("endpoint", endpoint);
  } catch {
    /* ignore */
  }
}

export async function sendWebPushForNotificationIds(
  notificationIds: string[],
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  if (notificationIds.length === 0) return { sent, failed };
  if (!configureWebPush()) return { sent, failed };

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("notifications")
    .select(
      "id, organization_id, recipient_profile_id, kind, title, body, href, entity_type, entity_id, actor_person_id, read_at, created_at",
    )
    .in("id", notificationIds);

  if (error || !rows?.length) {
    if (error) console.warn("load notifications for push failed", error.message);
    return { sent, failed };
  }

  const byProfile = new Map<string, NotificationRow[]>();
  for (const raw of rows) {
    const row = raw as NotificationRow;
    const list = byProfile.get(row.recipient_profile_id) ?? [];
    list.push(row);
    byProfile.set(row.recipient_profile_id, list);
  }

  const subs = await loadSubscriptions([...byProfile.keys()]);
  const subsByProfile = new Map<string, PushSubRow[]>();
  for (const s of subs) {
    const list = subsByProfile.get(s.profile_id) ?? [];
    list.push(s);
    subsByProfile.set(s.profile_id, list);
  }

  for (const [profileId, notifs] of byProfile) {
    const profileSubs = subsByProfile.get(profileId) ?? [];
    if (profileSubs.length === 0) continue;
    for (const notif of notifs) {
      const payload = JSON.stringify({
        title: notif.title,
        body: notif.body,
        href: notif.href,
        tag: notificationTag(notif),
        notificationId: notif.id,
      });
      for (const sub of profileSubs) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload,
          );
          sent += 1;
        } catch (err) {
          failed += 1;
          const status = (err as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) {
            await deleteSubscriptionByEndpoint(sub.endpoint);
          } else {
            console.warn("web push send failed", status ?? err);
          }
        }
      }
    }
  }

  return { sent, failed };
}

/** Insert feed rows and fan out Web Push. */
export async function emitAndPushNotifications(
  input: EmitNotificationInput,
): Promise<{ ids: string[]; sent: number; failed: number }> {
  const ids = await insertNotificationRows(input);
  const push = await sendWebPushForNotificationIds(ids);
  if (ids.length > 0) {
    console.info(
      "[notifications] emit",
      JSON.stringify({
        kind: input.kind,
        recipients: input.recipientProfileIds.length,
        inserted: ids.length,
        pushSent: push.sent,
        pushFailed: push.failed,
      }),
    );
  }
  return { ids, ...push };
}
