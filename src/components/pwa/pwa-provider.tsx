"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useData } from "@/lib/data/store";
import { OS_NOTIFICATION_CLICK_EVENT } from "@/lib/desktop-notifications";
import { createClient } from "@/lib/supabase/client";

const DISMISS_UNTIL_KEY = "reaper:pwa-install-dismiss-until";
const LEGACY_DISMISS_KEY = "reaper:pwa-install-dismissed";
/** After "Not now", wait this long before auto-prompting again. */
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000;
const REAPER_NOTIF_PARAM = "reaper_notif";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type PwaInstallContextValue = {
  /** Running as installed app (standalone window). */
  isInstalled: boolean;
  /** Browser has a deferred install prompt ready. */
  canInstall: boolean;
  install: () => Promise<boolean>;
  /** Clear dismiss and show the banner again (if install is available). */
  showInstallPrompt: () => void;
};

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);

export function usePwaInstall(): PwaInstallContextValue {
  const ctx = useContext(PwaInstallContext);
  if (!ctx) {
    return {
      isInstalled: false,
      canInstall: false,
      install: async () => false,
      showInstallPrompt: () => {},
    };
  }
  return ctx;
}

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone);
}

function navigateLaunchTarget(
  target: string,
  router: ReturnType<typeof useRouter>,
) {
  try {
    const url = new URL(target, window.location.origin);
    if (url.origin !== window.location.origin) {
      window.location.assign(url.href);
      return;
    }
    router.push(`${url.pathname}${url.search}${url.hash}`);
  } catch {
    window.location.assign(target);
  }
}

function readDismissed(): boolean {
  try {
    if (window.localStorage.getItem(LEGACY_DISMISS_KEY) === "1") {
      window.localStorage.removeItem(LEGACY_DISMISS_KEY);
      writeDismissed();
      return true;
    }
    const until = Number(window.localStorage.getItem(DISMISS_UNTIL_KEY) ?? "0");
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    window.localStorage.setItem(
      DISMISS_UNTIL_KEY,
      String(Date.now() + DISMISS_MS),
    );
  } catch {
    /* ignore */
  }
}

function clearDismissed() {
  try {
    window.localStorage.removeItem(DISMISS_UNTIL_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Registers the notification service worker and surfaces install UX
 * (banner + Settings) when the browser offers a PWA install prompt.
 */
export function PwaProvider({ children }: { children?: ReactNode }) {
  const router = useRouter();
  const { mode, markNotificationFeedRead, ready } = useData();
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const markOsNotificationRead = useCallback(
    (notificationId: string | null | undefined) => {
      const id = notificationId?.trim();
      if (!id) return;
      markNotificationFeedRead([id]);
      if (mode !== "supabase") return;
      const now = new Date().toISOString();
      void createClient()
        .from("notifications")
        .update({ read_at: now })
        .eq("id", id)
        .then(({ error }) => {
          if (error) {
            console.warn("mark OS notification read failed", error.message);
          }
        });
    },
    [markNotificationFeedRead, mode],
  );

  useEffect(() => {
    setIsInstalled(isStandaloneDisplay());
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker
      .register("/sw.js")
      .then(() => {
        void import("@/lib/web-push-client").then(({ ensurePushSubscription }) => {
          void ensurePushSubscription();
        });
      })
      .catch(() => {
        /* ignore — private mode / unsupported */
      });

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "REAPER_NOTIFICATION_CLICK") return;
      const href = event.data?.href;
      const notificationId =
        typeof event.data?.notificationId === "string"
          ? event.data.notificationId
          : null;
      markOsNotificationRead(notificationId);
      if (href) navigateLaunchTarget(String(href), router);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router, markOsNotificationRead]);

  // Cold start from OS toast (openWindow appended ?reaper_notif=).
  useEffect(() => {
    if (!ready) return;
    try {
      const url = new URL(window.location.href);
      const id = url.searchParams.get(REAPER_NOTIF_PARAM);
      if (!id) return;
      url.searchParams.delete(REAPER_NOTIF_PARAM);
      window.history.replaceState(
        {},
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
      markOsNotificationRead(id);
    } catch {
      /* ignore */
    }
  }, [ready, markOsNotificationRead]);

  // Fallback path: Notification API click (no service worker show).
  useEffect(() => {
    const onOsClick = (ev: Event) => {
      const detail = (ev as CustomEvent<{ notificationId?: string }>).detail;
      markOsNotificationRead(detail?.notificationId);
    };
    window.addEventListener(OS_NOTIFICATION_CLICK_EVENT, onOsClick);
    return () =>
      window.removeEventListener(OS_NOTIFICATION_CLICK_EVENT, onOsClick);
  }, [markOsNotificationRead]);

  useEffect(() => {
    const launchQueue = (
      window as Window & {
        launchQueue?: {
          setConsumer: (
            callback: (params: { targetURL?: string }) => void,
          ) => void;
        };
      }
    ).launchQueue;
    if (!launchQueue?.setConsumer) return;

    launchQueue.setConsumer((params) => {
      const target = params.targetURL;
      if (!target) return;
      try {
        const url = new URL(target, window.location.origin);
        const id = url.searchParams.get(REAPER_NOTIF_PARAM);
        if (id) markOsNotificationRead(id);
      } catch {
        /* ignore */
      }
      navigateLaunchTarget(target, router);
    });
  }, [router, markOsNotificationRead]);

  useEffect(() => {
    if (isStandaloneDisplay()) return;

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setCanInstall(true);
      if (!readDismissed()) setShowHint(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () =>
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  const install = useCallback(async () => {
    const ev = deferredPrompt.current;
    if (!ev?.prompt) return false;
    await ev.prompt();
    try {
      await ev.userChoice;
    } catch {
      /* ignore */
    }
    deferredPrompt.current = null;
    setCanInstall(false);
    setShowHint(false);
    clearDismissed();
    return true;
  }, []);

  const showInstallPrompt = useCallback(() => {
    clearDismissed();
    if (deferredPrompt.current) {
      setCanInstall(true);
      setShowHint(true);
    }
  }, []);

  const value = useMemo(
    () => ({ isInstalled, canInstall, install, showInstallPrompt }),
    [isInstalled, canInstall, install, showInstallPrompt],
  );

  function dismiss() {
    setShowHint(false);
    writeDismissed();
  }

  return (
    <PwaInstallContext.Provider value={value}>
      {children}
      {showHint && canInstall && !isInstalled ? (
        <div className="pointer-events-none fixed bottom-4 left-4 right-4 z-[80] flex justify-center sm:left-auto sm:right-4 sm:justify-end">
          <div className="pointer-events-auto flex max-w-md items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-lg">
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium text-[var(--text)]">
                Install the Reaper app
              </p>
              <p className="mt-0.5 text-[var(--text-muted)]">
                Open Reaper from your desktop like a regular app — faster launch,
                its own window, always one click away.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-1.5">
              <Button
                type="button"
                variant="primary"
                onClick={() => void install()}
              >
                Install
              </Button>
              <Button type="button" variant="ghost" onClick={dismiss}>
                Not now
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </PwaInstallContext.Provider>
  );
}
