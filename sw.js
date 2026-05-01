/* ============================================================
   sw.js – MotoRoute Service Worker
   Handles: offline caching + Web Push Notifications
   ============================================================ */

const CACHE_NAME = 'motoroute-v8';
const API_CACHE_NAME  = 'motoroute-api-v1';
const TILE_CACHE_NAME = 'motoroute-tiles-v1';
const TILE_CACHE_MAX  = 500; // ~500 Tiles × ø20 KB = max ~10 MB

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
          .filter(k => k !== CACHE_NAME && k !== API_CACHE_NAME && k !== TILE_CACHE_NAME)
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

  // Externe CDNs & nicht-cacheable Supabase-Endpunkte immer live abrufen
  if (
    url.hostname.includes('cloudinary.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('cdnjs.cloudflare.com') ||
    url.hostname.includes('jsdelivr.net') ||
    url.hostname.includes('open-meteo.com')
  ) {
    return; // Browser-Standard
  }

  // Supabase REST GET → Stale-While-Revalidate (offline-fähig)
  if (
    url.hostname.includes('supabase.co') &&
    url.pathname.startsWith('/rest/v1/') &&
    event.request.method === 'GET'
  ) {
    event.respondWith(
      caches.open(API_CACHE_NAME).then(async cache => {
        const cached = await cache.match(event.request);

        // Netzwerkabruf starten (im Hintergrund oder als Hauptantwort)
        const networkPromise = fetch(event.request).then(response => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        }).catch(() => null);

        if (cached) {
          // Cache sofort zurückgeben, Netzwerk aktualisiert im Hintergrund
          networkPromise;
          return cached;
        }

        // Kein Cache → auf Netzwerk warten, bei Fehler sofort 503 zurückgeben
        const result = await networkPromise;
        return result || new Response(JSON.stringify({ error: 'offline', message: 'Offline – kein Cache verfügbar' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      })
    );
    return;
  }

  // Alle anderen Supabase-Endpunkte (auth, functions, storage) → immer live
  if (url.hostname.includes('supabase.co')) {
    return; // Browser-Standard
  }

  // Karten-Tiles (OpenStreetMap) — Cache-first, Größenlimit
  if (url.hostname.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.open(TILE_CACHE_NAME).then(async cache => {
        const cached = await cache.match(event.request);
        if (cached) return cached;

        // Tile noch nicht gecacht → laden und speichern
        const response = await fetch(event.request);
        if (response.ok) {
          await cache.put(event.request, response.clone());

          // Älteste Tiles entfernen wenn Limit überschritten
          const keys = await cache.keys();
          if (keys.length > TILE_CACHE_MAX) {
            const toDelete = keys.slice(0, keys.length - TILE_CACHE_MAX);
            toDelete.forEach(k => cache.delete(k));
          }
        }
        return response;
      }).catch(() => {
        // Offline + nicht gecacht → leere aber gültige PNG-Antwort
        // (Leaflet zeigt graue Tile statt kaputtem Bild-Icon)
        return new Response(
          atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
          { status: 200, headers: { 'Content-Type': 'image/png' } }
        );
      })
    );
    return;
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
