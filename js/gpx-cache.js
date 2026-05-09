/* ============================================================
   gpx-cache.js – IndexedDB Persistenz für Tour-GPX-Daten
   ----------------------------------------------------------
   localStorage hat ein 5–10 MB Limit und persistState() schreibt
   den ganzen state-Snapshot inkl. state.currentTour.gpx_route
   (bis zu 800 KB pro Tour). Damit bleibt für andere persistierte
   Felder kaum Platz, und Multi-Tour-Sessions verlieren GPX beim
   Wechsel.

   IndexedDB löst beides:
   • Praktisch unbegrenzter Speicher (mind. 50 MB ohne Nachfrage)
   • GPX pro Tour-ID separat speicherbar → Tour A wird nicht
     überschrieben wenn der User Tour B öffnet
   • Fingerprint-basierte Invalidierung (gleiches Schema wie
     _routeFingerprint in api.js)
   ============================================================ */

const GPX_DB_NAME    = 'motoroute-gpx';
const GPX_DB_VERSION = 1;
const GPX_STORE_NAME = 'tour_gpx';

let _gpxDbPromise = null;

function _openGpxDb() {
  if (_gpxDbPromise) return _gpxDbPromise;
  _gpxDbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB nicht verfügbar'));
      return;
    }
    const req = indexedDB.open(GPX_DB_NAME, GPX_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(GPX_STORE_NAME)) {
        db.createObjectStore(GPX_STORE_NAME, { keyPath: 'tour_id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
  return _gpxDbPromise;
}

function _gpxFingerprint(routeMetadata) {
  if (!routeMetadata) return '';
  return `${routeMetadata.trackCount || 0}:${routeMetadata.waypointCount || 0}:${routeMetadata.totalDistance || 0}`;
}

/**
 * Liest GPX aus IndexedDB. Liefert null wenn nicht vorhanden oder
 * Fingerprint nicht zur aktuellen route_metadata passt (Stale).
 */
async function gpxCacheGet(tourId, currentRouteMetadata) {
  if (!tourId) return null;
  try {
    const db = await _openGpxDb();
    return await new Promise((resolve, reject) => {
      const tx    = db.transaction(GPX_STORE_NAME, 'readonly');
      const store = tx.objectStore(GPX_STORE_NAME);
      const req   = store.get(tourId);
      req.onsuccess = () => {
        const row = req.result;
        if (!row) return resolve(null);
        const expected = _gpxFingerprint(currentRouteMetadata);
        // Wenn wir keinen aktuellen Fingerprint haben (z.B. weil
        // route_metadata noch nicht geladen ist), trotzdem den Cache
        // zurückgeben — ist besser als nichts und wird beim nächsten
        // _preserveCachedRoute geprüft.
        if (expected && row.fingerprint && row.fingerprint !== expected) {
          return resolve(null); // stale
        }
        resolve(row.gpx_route || null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[gpxCache] get failed:', e);
    return null;
  }
}

/**
 * Schreibt GPX in IndexedDB mit aktuellem Fingerprint.
 */
async function gpxCachePut(tourId, gpxRoute, routeMetadata) {
  if (!tourId || !gpxRoute) return;
  try {
    const db = await _openGpxDb();
    await new Promise((resolve, reject) => {
      const tx    = db.transaction(GPX_STORE_NAME, 'readwrite');
      const store = tx.objectStore(GPX_STORE_NAME);
      const req = store.put({
        tour_id:     tourId,
        gpx_route:   gpxRoute,
        fingerprint: _gpxFingerprint(routeMetadata),
        saved_at:    Date.now(),
      });
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[gpxCache] put failed:', e);
  }
}

/**
 * Löscht den Cache-Eintrag für eine Tour (z.B. bei GPX-Update/Delete).
 */
async function gpxCacheDelete(tourId) {
  if (!tourId) return;
  try {
    const db = await _openGpxDb();
    await new Promise((resolve, reject) => {
      const tx    = db.transaction(GPX_STORE_NAME, 'readwrite');
      const store = tx.objectStore(GPX_STORE_NAME);
      const req = store.delete(tourId);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[gpxCache] delete failed:', e);
  }
}

/**
 * Räumt alte Einträge auf — Touren, die nicht mehr in state.tours
 * existieren (gelöscht, aus Community geflogen). Wird beim App-Start
 * aufgerufen.
 */
async function gpxCacheCleanup(activeTourIds) {
  if (!Array.isArray(activeTourIds)) return;
  const keep = new Set(activeTourIds);
  try {
    const db = await _openGpxDb();
    await new Promise((resolve, reject) => {
      const tx    = db.transaction(GPX_STORE_NAME, 'readwrite');
      const store = tx.objectStore(GPX_STORE_NAME);
      const req = store.openCursor();
      req.onsuccess = e => {
        const cur = e.target.result;
        if (!cur) return resolve();
        if (!keep.has(cur.key)) cur.delete();
        cur.continue();
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[gpxCache] cleanup failed:', e);
  }
}
