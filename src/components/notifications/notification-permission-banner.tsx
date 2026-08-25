"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import {
  clearNotificationPermissionPromptPrefs,
  dismissNotificationPermissionPrompt,
  ensureDesktopNotificationPermission,
  shouldOfferNotificationPermissionPrompt,
  snoozeNotificationPermissionPrompt,
} from "@/lib/desktop-notifications";
import { ensurePushSubscription } from "@/lib/web-push-client";
import { cn } from "@/lib/cn";

/**
 * Top bar prompting the user to enable desktop notifications when permission
 * is still undecided. Snooze hides for 1 day; X dismisses until storage clears.
 */
export function NotificationPermissionBanner() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    setVisible(shouldOfferNotificationPermissionPrompt());
  }, []);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  useEffect(() => {
    if (!visible) return;
    // If permission is granted elsewhere, drop prefs and hide.
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      clearNotificationPermissionPromptPrefs();
      setVisible(false);
      void ensurePushSubscription();
    }
  }, [visible]);

  async function onEnable() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await ensureDesktopNotificationPermission();
      if (result === "granted") {
        clearNotificationPermissionPromptPrefs();
        setVisible(false);
        void ensurePushSubscription();
      } else {
        // Denied or still default — refresh visibility rules.
        refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  function onSnooze() {
    snoozeNotificationPermissionPrompt(1);
    setVisible(false);
  }

  function onDismiss() {
    dismissNotificationPermissionPrompt();
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="flex shrink-0 items-center gap-3 bg-[#5c6370] px-3 py-2 text-white sm:px-4"
      role="region"
      aria-label="Enable notifications"
    >
      <Bell
        size={16}
        strokeWidth={1.75}
        className="hidden shrink-0 sm:block"
        aria-hidden
      />
      <p className="min-w-0 flex-1 text-sm leading-snug">
        Stay on top of mentions and updates. Turn on real-time notifications.
      </p>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onEnable()}
          className={cn(
            "inline-flex h-8 cursor-pointer items-center justify-center rounded-md border border-white/80 px-3 text-xs font-medium text-white",
            "hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {busy ? "Enabling…" : "Enable"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onSnooze}
          className={cn(
            "inline-flex h-8 cursor-pointer items-center justify-center rounded-md border border-white/80 px-3 text-xs font-medium text-white",
            "hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          Snooze
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDismiss}
          className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-white/90 hover:bg-white/10 hover:text-white disabled:opacity-60"
          aria-label="Dismiss"
          title="Dismiss"
        >
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
