self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { data = { body: event.data?.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || 'ChatWave', {
    body: data.body || 'You have a new message.',
    icon: '/icons/chatwave.svg',
    badge: '/icons/chatwave.svg',
    tag: data.conversationId || 'ChatWave-message',
    data: { url: data.url || '/' }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    const current = windows.find(client => client.url.startsWith(self.location.origin));
    if (current) { current.navigate(destination); return current.focus(); }
    return clients.openWindow(destination);
  }));
});
