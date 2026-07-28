/* Reaper notification service worker — enables PWA-branded OS toasts when installed.
 * Bump REAPER_SW_REV when this file changes so browsers pick up a new worker. */
const REAPER_SW_REV = "0.4.75";
void REAPER_SW_REV;

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
