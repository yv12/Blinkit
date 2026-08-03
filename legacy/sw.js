/* sw.js — delivers nudges after the user has left the app.

   Two paths:
   1. SCHEDULE_NUDGE  — the page hands the SW a payload and a delay. The SW
      holds the timer, so the notification still fires after the tab is
      backgrounded or navigated away. This is what the demo uses.
   2. push            — a real Web Push from a server. Works when the browser
      is fully closed. Wire this up if you add a push server later; the
      handler is already here so nothing else has to change.
*/

self.addEventListener("install", e => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("message", event => {
  const { type, delayMs, payload } = event.data || {};
  if (type !== "SCHEDULE_NUDGE") return;

  event.waitUntil(
    new Promise(resolve => {
      setTimeout(async () => {
        await self.registration.showNotification(payload.title, {
          body: payload.body,
          tag: payload.tag,
          badge: "./icon-badge.png",
          icon: "./icon.png",
          data: { url: payload.url },
          actions: [{ action: "open", title: payload.cta }]
        });
        resolve();
      }, delayMs);
    })
  );
});

/* Real push from a server, for when the browser is fully closed. */
self.addEventListener("push", event => {
  const p = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(p.title || "Blinkit", {
      body: p.body || "",
      tag: p.tag || "nudge",
      data: { url: p.url || "./index.html" },
      actions: p.cta ? [{ action: "open", title: p.cta }] : []
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = event.notification.data?.url || "./index.html";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const c of list) if ("focus" in c) return c.focus();
      return self.clients.openWindow(url);
    })
  );
});
