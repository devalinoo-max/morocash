// Notifications push, chargé dans le Service Worker généré par Workbox
// (voir workbox.importScripts dans vite.config.ts). Le serveur envoie
// { title, body, url } (voir src/server/modules/push/service.ts du backend).

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'MoroCash', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/accueil' },
    })
  );
});

// Au clic : on remet au premier plan l'app déjà ouverte (sur la bonne page),
// sinon on l'ouvre.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/accueil', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const client = clients.find((c) => new URL(c.url).origin === self.location.origin);
      if (client) {
        return client.focus().then((c) => (c && 'navigate' in c ? c.navigate(url) : undefined));
      }
      return self.clients.openWindow(url);
    })
  );
});
