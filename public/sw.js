/* Reaper notification service worker — enables PWA-branded OS toasts when installed.
 * Bump REAPER_SW_REV when this file changes so browsers pick up a new worker. */
const REAPER_SW_REV = "0.4.310";
void REAPER_SW_REV;

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/** Web Push → OS toast when no focused app window (avoids duplicate with open-tab toasts). */
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let payload = {
        title: "Reaper",
        body: "",
        href: "/",
        tag: undefined,
        notificationId: undefined,
      };
      try {
        if (event.data) {
          const raw = event.data.json();
          payload = {
            title: String(raw.title || "Reaper"),
            body: String(raw.body || ""),
            href: String(raw.href || "/"),
            tag: raw.tag ? String(raw.tag) : undefined,
            notificationId: raw.notificationId
              ? String(raw.notificationId)
              : undefined,
          };
        }
      } catch {
        try {
          const text = event.data ? event.data.text() : "";
          if (text) payload.body = text;
        } catch {
          /* ignore */
        }
      }

      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const focused = clients.some((c) => c.focused);
      if (focused) {
        for (const client of clients) {
          client.postMessage({
            type: "REAPER_PUSH_FOREGROUND",
            href: payload.href,
            notificationId: payload.notificationId,
            title: payload.title,
            body: payload.body,
          });
        }
        return;
      }

      await self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: "/pwa-icons/192",
        badge: "/pwa-icons/192",
        tag: payload.tag || payload.notificationId || "reaper",
        data: {
          href: payload.href,
          notificationId: payload.notificationId,
        },
        renotify: true,
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href =
    (event.notification.data && event.notification.data.href) || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of all) {
        if ("focus" in client) {
          await client.focus();
          client.postMessage({ type: "REAPER_NOTIFICATION_CLICK", href });
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(href);
      }
    })(),
  );
});
