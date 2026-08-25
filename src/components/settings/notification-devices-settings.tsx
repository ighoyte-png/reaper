"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast/toast-provider";
import {
  desktopNotificationPermission,
  ensureDesktopNotificationPermission,
} from "@/lib/desktop-notifications";
import {
  ensurePushSubscription,
  listPushSubscriptions,
  revokePushSubscription,
  vapidPublicKey,
  type PushSubscriptionListItem,
} from "@/lib/web-push-client";

function deviceLabel(sub: PushSubscriptionListItem): string {
  const ua = sub.user_agent || "";
  if (/Edg\//i.test(ua)) return "Edge";
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return "Chrome";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return "Safari";
  if (ua) return ua.slice(0, 48) + (ua.length > 48 ? "…" : "");
  return "Browser";
}

function formatSeen(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  try {
    return new Date(t).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/** Preferences: enable desktop alerts + revoke push devices. */
export function NotificationDevicesSettings() {
  const { push } = useToast();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "default",
  );
  const [subs, setSubs] = useState<PushSubscriptionListItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const pushConfigured = Boolean(vapidPublicKey());

  const refreshPermission = useCallback(() => {
    if (typeof Notification === "undefined") {
      setPermission("unsupported");
      return;
    }
    setPermission(desktopNotificationPermission());
  }, []);

  const refreshSubs = useCallback(async () => {
    if (!pushConfigured) {
      setSubs([]);
      return;
    }
    setLoadingSubs(true);
    try {
      setSubs(await listPushSubscriptions());
    } finally {
      setLoadingSubs(false);
    }
  }, [pushConfigured]);

  useEffect(() => {
    refreshPermission();
    void refreshSubs();
  }, [refreshPermission, refreshSubs]);

  async function onEnable() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await ensureDesktopNotificationPermission();
      refreshPermission();
      if (result === "granted") {
        const ok = await ensurePushSubscription();
        await refreshSubs();
        push(
          ok
            ? "Desktop notifications enabled"
            : "Permission granted — push subscribe may need a refresh",
          ok ? "success" : undefined,
        );
      } else if (result === "denied") {
        push("Notifications are blocked in your browser settings");
      }
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await revokePushSubscription(id);
      if (ok) {
        setSubs((prev) => prev.filter((s) => s.id !== id));
        push("Device removed", "success");
      } else {
        push("Could not remove device");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-[var(--border)] p-3">
      <p className="text-sm font-medium text-[var(--text)]">
        Desktop notifications
      </p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        OS alerts for mentions, assignments, and comments — including when
        Reaper is closed (on subscribed devices).
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {permission === "unsupported" ? (
          <p className="text-sm text-[var(--text-muted)]">
            This browser does not support notifications.
          </p>
        ) : permission === "granted" ? (
          <p className="text-sm text-[var(--text-muted)]">
            Notifications are enabled on this browser.
          </p>
        ) : permission === "denied" ? (
          <p className="text-sm text-[var(--text-muted)]">
            Blocked by the browser. Allow notifications for this site in browser
            settings, then reload.
          </p>
        ) : (
          <Button
            type="button"
            variant="primary"
            disabled={busy}
            onClick={() => void onEnable()}
          >
            {busy ? "Enabling…" : "Enable notifications"}
          </Button>
        )}
        {permission === "granted" && pushConfigured ? (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => {
              void (async () => {
                setBusy(true);
                try {
                  await ensurePushSubscription();
                  await refreshSubs();
                  push("This device subscribed for closed-app alerts", "success");
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            Refresh this device
          </Button>
        ) : null}
      </div>

      {pushConfigured ? (
        <div className="mt-4 border-t border-[var(--border)] pt-3">
          <p className="text-xs font-medium text-[var(--text)]">
            Subscribed devices
          </p>
          {loadingSubs ? (
            <p className="mt-2 text-xs text-[var(--text-muted)]">Loading…</p>
          ) : subs.length === 0 ? (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              No devices yet. Enable notifications above to register this one.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {subs.map((sub) => (
                <li
                  key={sub.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[var(--text)]">
                      {deviceLabel(sub)}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      Last seen {formatSeen(sub.last_seen_at)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => void onRevoke(sub.id)}
                  >
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          Closed-app push requires VAPID keys on the server (
          <code className="text-[10px]">NEXT_PUBLIC_VAPID_PUBLIC_KEY</code>).
        </p>
      )}
    </div>
  );
}
