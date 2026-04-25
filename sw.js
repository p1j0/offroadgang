/* ============================================================
   sw.js – MotoRoute Service Worker
   Handles: offline caching + Web Push Notifications
   ============================================================ */

const CACHE_NAME = 'motoroute-v8';

// App-Shell: alles was offline verfügbar sein soll
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/styles.css',
  '/css/theme-premium.css',
  '/js/config.js',
  '/js/state.js',
  '/js/utils.js',
  '/js/api.js',
  '/js/auth.js',
  '/js/map.js',
  '/js/render.js',
  '/js/events.js',
  '/js/app.js',
  '/img/icon-192x192.png',
  '/img/icon-512x512.png',
  '/img/apple-touch-icon.png'
];

/* ----------------------------------------------------------
   Install – App-Shell cachen
   ---------------------------------------------------------- */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())   // become "waiting" then immediately active
  );
});

/* ----------------------------------------------------------
   Activate – alte Caches aufräumen + sofort übernehmen
   ---------------------------------------------------------- */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())   // take control of open pages without reload-required
  );
});

/* ----------------------------------------------------------
   Fetch – Network-first für API, Cache-first für Assets
   ---------------------------------------------------------- */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Supabase & externe APIs immer live abrufen
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('cloudinary.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('cdnjs.cloudflare.com') ||
    url.hostname.includes('jsdelivr.net')
  ) {
    return; // Browser-Standard
  }

  // App-Shell: Cache-first, Fallback auf Network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Nur GET-Antworten cachen
        if (event.request.method !== 'GET' || !response.ok) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        return response;
      }).catch(() => {
        // Offline-Fallback für Navigation
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

/* ----------------------------------------------------------
   Message – SKIP_WAITING für sofortiges Update
   ---------------------------------------------------------- */
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* ----------------------------------------------------------
   Push – Eingehende Benachrichtigung anzeigen
   ---------------------------------------------------------- */
self.addEventListener('push', event => {
  let data = { title: 'MotoRoute', body: 'Neue Benachrichtigung', icon: '/img/icon-192x192.png' };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:   data.body,
      icon:   data.icon  || '/img/icon-192x192.png',
      badge:  '/img/icon-72x72.png',
      tag:    data.tag   || 'motoroute',
      data:   { url: data.url || '/' },
      vibrate: [100, 50, 100]
    })
  );
});

/* ----------------------------------------------------------
   Notification Click – App öffnen / in den Vordergrund bringen
   ---------------------------------------------------------- */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
