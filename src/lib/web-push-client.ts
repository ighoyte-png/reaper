/** Client-side Web Push subscribe / unsubscribe helpers. */

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    out[i] = raw.charCodeAt(i);
  }
  return out;
}

export function vapidPublicKey(): string | null {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  return key || null;
}

export async function ensurePushSubscription(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  if (typeof Notification === "undefined") return false;
  if (Notification.permission !== "granted") return false;

  const publicKey = vapidPublicKey();
  if (!publicKey) return false;

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
    }
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

    const res = await fetch("/api/notifications/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        userAgent: navigator.userAgent,
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn("ensurePushSubscription failed", err);
    return false;
  }
}

export type PushSubscriptionListItem = {
  id: string;
  endpoint: string;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
};

export async function listPushSubscriptions(): Promise<
  PushSubscriptionListItem[]
> {
  try {
    const res = await fetch("/api/notifications/subscribe", {
      credentials: "same-origin",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      subscriptions?: PushSubscriptionListItem[];
    };
    return data.subscriptions ?? [];
  } catch {
    return [];
  }
}

export async function revokePushSubscription(id: string): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/notifications/subscribe?id=${encodeURIComponent(id)}`,
      { method: "DELETE", credentials: "same-origin" },
    );
    return res.ok;
  } catch {
    return false;
  }
}
