// Notifications are delivered by the browser even when the admin tab is closed.
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { /* Use safe defaults. */ }
  event.waitUntil(self.registration.showNotification(payload.title || 'Nouvelle demande sur Djesshop ✨', {
    body: payload.body || 'Un nouveau projet t’attend dans ton espace administration.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag || 'djesshop-nouvelle-demande',
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const target = new URL('/admin', self.location.origin).href;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin && new URL(client.url).pathname.startsWith('/admin'));
    if (existing) return existing.focus();
    return self.clients.openWindow(target);
  })());
});
