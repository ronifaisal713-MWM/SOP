// Service worker for Web Push. Runs in the background even when no
// Agency OS tab is open, which is what lets a notification arrive on a
// phone with the app closed.

self.addEventListener("install", () => {
  // Take over immediately rather than waiting for existing tabs to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Agency OS", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Agency OS";
  const options = {
    body: payload.body || "",
    icon: "/icon-512.png",
    badge: "/icon-512.png",
    // Vibration only does anything on Android; iOS ignores it.
    vibrate: [200, 100, 200],
    data: { url: payload.url || "/dashboard" },
    // Collapse repeats of the same thing instead of stacking them up.
    tag: payload.tag || undefined,
    renotify: !!payload.tag,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Reuse an already-open tab if there is one, rather than piling up
      // new windows every time a notification is tapped.
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
