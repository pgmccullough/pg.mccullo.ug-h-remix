/**
 * Service worker for pg.mccullo.ug — handles Web Push notifications.
 *
 * Runs independently of any open tabs, so notifications keep arriving
 * on the phone/desktop even when the browser is closed. Kept
 * deliberately minimal: no caching yet, just push + click handling.
 */

self.addEventListener("install", (event) => {
  // Take control immediately without waiting for tab reload.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    // Payload wasn't JSON — treat the raw text as body.
    data = { title: "New notification", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "pg.mccullo.ug";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/icon-192.png",
    tag: data.tag || undefined,
    // Custom payload we'll read back in notificationclick so we know
    // where to navigate (e.g. the visited path).
    data: {
      url: data.url || "/h",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/h";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // If any tab is already open, focus it and navigate.
        for (const client of clientList) {
          if ("focus" in client) {
            // Prefer an existing pg.mccullo.ug tab.
            try {
              const clientUrl = new URL(client.url);
              const targetAbs = new URL(targetUrl, self.location.origin);
              if (clientUrl.origin === targetAbs.origin) {
                client.navigate?.(targetAbs.href);
                return client.focus();
              }
            } catch (e) { /* fall through */ }
          }
        }
        // Otherwise open a fresh window.
        return self.clients.openWindow(targetUrl);
      })
  );
});
