self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'TellHub Notification';
  const options = {
    body: data.body || 'You have a new alert',
    icon: '/icon-512.png',
    badge: '/icon-512.png',
    vibrate: [200, 100, 200, 100, 200, 100, 400],
    tag: data.tag || 'tellhub-notification',
    renotify: true,
    data: data.url || '/'
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data)
  );
});