/* Reaper notification service worker — enables PWA-branded OS toasts when installed. */
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
