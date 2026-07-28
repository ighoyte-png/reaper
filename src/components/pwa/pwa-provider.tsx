"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "reaper:pwa-install-dismissed";

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone);
}

/**
 * Registers the notification service worker and, when Chrome offers install,
 * prompts so OS toasts can show as "Reaper" instead of "Google Chrome".
 */
export function PwaProvider() {
  const router = useRouter();
  const deferredPrompt = useRef<Event | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* ignore — private mode / unsupported */
    });

    const onMessage = (event: MessageEvent) => {
      const href = event.data?.href;
      if (event.data?.type !== "REAPER_NOTIFICATION_CLICK" || !href) return;
      try {
        const url = new URL(String(href), window.location.origin);
        if (url.origin === window.location.origin) {
          router.push(`${url.pathname}${url.search}${url.hash}`);
          return;
        }
      } catch {
        /* fall through */
      }
      window.location.assign(String(href));
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  useEffect(() => {
    if (isStandaloneDisplay()) return;
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* ignore */
    }

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e;
      setCanInstall(true);
      setShowHint(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () =>
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  async function install() {
    const ev = deferredPrompt.current as
      | (Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> })
      | null;
    if (!ev?.prompt) return;
    await ev.prompt();
    try {
      await ev.userChoice;
    } catch {
      /* ignore */
    }
    deferredPrompt.current = null;
    setCanInstall(false);
    setShowHint(false);
  }

  function dismiss() {
    setShowHint(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  if (!showHint || !canInstall) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 right-4 z-[80] flex justify-center sm:left-auto sm:right-4 sm:justify-end">
      <div className="pointer-events-auto flex max-w-md items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-lg">
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium text-[var(--text)]">Install the Reaper app</p>
          <p className="mt-0.5 text-[var(--text-muted)]">
            Open Reaper from your desktop like a regular app — faster launch, its
            own window, always one click away.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          <Button type="button" variant="primary" onClick={() => void install()}>
            Install
          </Button>
          <Button type="button" variant="ghost" onClick={dismiss}>
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}
