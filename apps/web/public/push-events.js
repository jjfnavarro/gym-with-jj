/* Background delivery runs independently of an open workout page. */
self.addEventListener('push', (event) => {
  let payload;
  try {
    payload = event.data?.json();
  } catch {
    /* Show a useful fallback. */
  }
  const notification = payload?.notification ?? {};
  event.waitUntil(
    self.registration.showNotification(notification.title || 'Rest complete', {
      body: notification.body || 'Time for your next set.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'jj-rest-complete',
      silent: notification.silent === true,
      data: { url: notification.data?.url || notification.navigate || '/' },
    }),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let url = new URL('/', self.location.origin);
  try {
    const candidate = new URL(event.notification.data?.url || '/', self.location.origin);
    if (candidate.origin === self.location.origin) url = candidate;
  } catch {
    /* Keep navigation inside this app. */
  }
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.navigate(url.href);
        return client.focus();
      }
      return self.clients.openWindow(url.href);
    })(),
  );
});
