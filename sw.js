/* ============================================================
   sw.js – MotoRoute Service Worker
   Handles: offline caching + Web Push Notifications
   ============================================================ */

const CACHE_NAME = 'motoroute-v10';
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
  '/js/gpx-cache.js',
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

function isAppShellRequest(event, url) {
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return false;
  if (event.request.mode === 'navigate') return true;
  return /\.(?:html|css|js|json|webmanifest)$/i.test(url.pathname);
}

function networkFirstWithCache(event, fallbackUrl) {
  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      try {
        const response = await fetch(event.request);
        if (response.ok) cache.put(event.request, response.clone());
        return response;
      } catch (e) {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        if (fallbackUrl) return cache.match(fallbackUrl);
        return undefined;
      }
    })
  );
}

/* ----------------------------------------------------------
   Fetch – Network-first für API/App-Shell, Cache-first für Tiles/Images
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

  // Supabase REST GET → Network-first mit Cache-Fallback.
  // Die App rendert bereits vorher den persistierten State. Wenn sie online
  // frisch nachlädt, muss der awaited Fetch deshalb echte Live-Daten liefern;
  // stale-first würde Änderungen oft erst beim zweiten/dritten Reload zeigen.
  if (
    url.hostname.includes('supabase.co') &&
    url.pathname.startsWith('/rest/v1/') &&
    event.request.method === 'GET'
  ) {
    event.respondWith(
      caches.open(API_CACHE_NAME).then(async cache => {
        try {
          const response = await fetch(event.request);
          // Bei abgelaufenem JWT (401/403) liefert Supabase einen Fehler zurück,
          // der im App-Layer wie "leeres Ergebnis" behandelt würde und so cached
          // State überschreiben kann. Lieber den vorhandenen Cache zurückgeben —
          // der Auth-Layer kümmert sich parallel um Token-Refresh, und beim
          // nächsten Refresh-Tick sehen wir wieder frische Daten.
          if (response.status === 401 || response.status === 403) {
            const cached = await cache.match(event.request);
            if (cached) return cached;
          }
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        } catch (e) {
          const cached = await cache.match(event.request);
          if (cached) return cached;
          return new Response(JSON.stringify({ error: 'offline', message: 'Offline – kein Cache verfügbar' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      })
    );
    return;
  }

  // Supabase REST Schreiboperationen → nach Erfolg betroffene Tabelle aus Cache entfernen
  // Verhindert, dass nach z.B. Beitritt die Mitgliederliste noch alt ist.
  if (
    url.hostname.includes('supabase.co') &&
    url.pathname.startsWith('/rest/v1/') &&
    ['POST', 'PATCH', 'PUT', 'DELETE'].includes(event.request.method)
  ) {
    event.respondWith((async () => {
      const response = await fetch(event.request);
      try {
        if (response.ok) {
          // Tabellenname aus dem Pfad extrahieren: /rest/v1/<table>...
          const tableMatch = url.pathname.match(/^\/rest\/v1\/([^/?]+)/);
          const table = tableMatch ? tableMatch[1] : null;
          if (table) {
            const cache = await caches.open(API_CACHE_NAME);
            const keys = await cache.keys();
            await Promise.all(keys.map(req => {
              const reqUrl = new URL(req.url);
              if (reqUrl.pathname.startsWith(`/rest/v1/${table}`)) {
                return cache.delete(req);
              }
            }));
          }
        }
      } catch (e) {
        // Cache-Invalidierung darf die Antwort nicht blockieren
      }
      return response;
    })());
    return;
  }

  // Alle anderen Supabase-Endpunkte (auth, functions, storage) → immer live
  if (url.hostname.includes('supabase.co')) {
    return; // Browser-Standard
  }

  // App-Shell (HTML/CSS/JS/Manifest): online immer frisch laden.
  // Wichtig für installierte PWAs: cache-first kann sonst nach Deploys alte
  // JS-Dateien mit neuem Serverstand mischen.
  if (isAppShellRequest(event, url)) {
    networkFirstWithCache(event, event.request.mode === 'navigate' ? '/index.html' : null);
    return;
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

  // Statische Medien: Cache-first, Fallback auf Network
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

  // Cache-Invalidierung für eine bestimmte Tabelle — wird von der App vor
  // einem frischen Tour-Fetch aufgerufen, damit stale Daten nicht gezeigt werden.
  if (event.data?.type === 'INVALIDATE_TABLE') {
    const table = event.data.table;
    const port  = event.ports?.[0];
    caches.open(API_CACHE_NAME).then(async cache => {
      const keys = await cache.keys();
      await Promise.all(keys.map(req => {
        const reqUrl = new URL(req.url);
        if (reqUrl.pathname.startsWith(`/rest/v1/${table}`)) return cache.delete(req);
      }));
      port?.postMessage('done');
    });
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
