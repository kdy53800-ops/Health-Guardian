const CACHE_NAME = 'health-guardian-shell-v20';
const APP_SHELL = [
  '/', '/index.html', '/dashboard.html', '/record.html', '/history.html', '/monthly.html', '/inbody.html',
  '/terms.html', '/privacy.html',
  '/css/style.css', '/css/ongil-theme.css', '/js/app.js', '/js/dashboard.js', '/js/record.js', '/js/history.js', '/js/monthly.js', '/js/inbody.js',
  '/images/ongil-symbol.png', '/images/ongil-hospital.png', '/images/app-icon.svg',
  '/images/app-icon-180.png', '/images/app-icon-192.png', '/images/app-icon-512.png', '/manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      return response;
    }).catch(() => caches.match(request).then(cached => cached || caches.match('/index.html'))));
    return;
  }

  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
    return response;
  })));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss-today' || event.action === 'snooze-30') {
    event.waitUntil(fetch('/api/check-session?view=notification-action', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: event.action }),
    }));
    return;
  }
  const targetUrl = event.notification.data && event.notification.data.url ? event.notification.data.url : '/dashboard.html';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(openClients => {
    const targetPath = new URL(targetUrl, self.location.origin).pathname;
    const existing = openClients.find(client => new URL(client.url).pathname === targetPath);
    if (existing) return existing.focus();
    return clients.openWindow(targetUrl);
  }));
});

self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (error) { payload = {}; }
  const title = payload.title || '건강지킴이 알림';
  event.waitUntil(self.registration.showNotification(title, {
    body: payload.body || '오늘의 건강 기록을 확인해 보세요.',
    icon: '/images/app-icon-192.png',
    badge: '/images/app-icon-192.png',
    tag: payload.tag || 'scheduled-health-reminder',
    data: { url: payload.url || '/dashboard.html' },
    actions: payload.actions === false ? [] : [
      { action: 'snooze-30', title: '30분 후' },
      { action: 'dismiss-today', title: '오늘은 그만' },
    ],
  }));
});
