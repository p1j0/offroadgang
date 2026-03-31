/* ============================================================
   map.js – Leaflet map management and GPX utilities
   Depends on: state.js, utils.js (esc)
   ============================================================ */

/* ----------------------------------------------------------
   Constants
   ---------------------------------------------------------- */

const TRACK_COLORS = [
  '#f07800', '#3dba7b', '#4a9eff', '#e04444',
  '#c97bff', '#ffd700', '#ff6b9d', '#00d4aa',
];

const NAMED_COLORS = {
  Red: '#e04444', DarkRed: '#8b0000',
  Blue: '#4a9eff', DarkBlue: '#00008b', LightBlue: '#87ceeb',
  Green: '#3dba7b', DarkGreen: '#006400',
  Cyan: '#00d4aa', Magenta: '#c97bff',
  Yellow: '#ffd700', Orange: '#f07800',
  White: '#eeebe4', Black: '#333333',
  Gray: '#7a7880', DarkGray: '#555555',
  Transparent: null,
};

/* ----------------------------------------------------------
   Module-level layer references
   ---------------------------------------------------------- */

let trackLayers     = [];
let waypointMarkers = [];

/* ----------------------------------------------------------
   GPX parsing
   ---------------------------------------------------------- */

function parseGPX(xml) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');

  const tracks = Array.from(doc.querySelectorAll('trk')).map((trk, i) => {
    const name  = trk.querySelector('name')?.textContent?.trim() || `Track ${i + 1}`;
    const color = _extractColor(trk);
    const points = Array.from(trk.querySelectorAll('trkpt'))
      .map(p => [parseFloat(p.getAttribute('lat')), parseFloat(p.getAttribute('lon'))])
      .filter(([a, b]) => !isNaN(a) && !isNaN(b));
    return { name, color, points };
  }).filter(t => t.points.length > 0);

  Array.from(doc.querySelectorAll('rte')).forEach((rte, i) => {
    const name   = rte.querySelector('name')?.textContent?.trim() || `Route ${i + 1}`;
    const color  = _extractColor(rte);
    const points = Array.from(rte.querySelectorAll('rtept'))
      .map(p => [parseFloat(p.getAttribute('lat')), parseFloat(p.getAttribute('lon'))])
      .filter(([a, b]) => !isNaN(a) && !isNaN(b));
    if (points.length) tracks.push({ name, color, points });
  });

  const waypoints = Array.from(doc.querySelectorAll('gpx > wpt')).map(wpt => ({
    lat:  parseFloat(wpt.getAttribute('lat')),
    lon:  parseFloat(wpt.getAttribute('lon')),
    name: wpt.querySelector('name')?.textContent?.trim() || 'Wegpunkt',
    desc: wpt.querySelector('desc')?.textContent?.trim() || '',
  })).filter(w => !isNaN(w.lat) && !isNaN(w.lon));

  return { tracks, waypoints };
}

function _extractColor(el) {
  const named = el.querySelector('DisplayColor')?.textContent?.trim();
  if (named && NAMED_COLORS[named] !== undefined) return NAMED_COLORS[named];
  const raw = el.querySelector('color, Color')?.textContent?.trim();
  if (raw) return raw.startsWith('#') ? raw : `#${raw.slice(-6)}`;
  return null;
}

function normalizeGPXRoute(gpxRoute) {
  if (!gpxRoute) return null;
  if (Array.isArray(gpxRoute)) {
    return { tracks: [{ name: 'Route', color: null, points: gpxRoute }], waypoints: [] };
  }
  return gpxRoute;
}

/* ----------------------------------------------------------
   GPX generation & download
   ---------------------------------------------------------- */

function buildGPX(tour) {
  const data = normalizeGPXRoute(tour.gpx_route);
  if (!data) return '';

  const tracksXml = data.tracks.map(t => `
  <trk>
    <name>${esc(t.name)}</name>
    <trkseg>
      ${t.points.map(([lat, lon]) => `<trkpt lat="${lat}" lon="${lon}"></trkpt>`).join('\n      ')}
    </trkseg>
  </trk>`).join('');

  const waypointsXml = (data.waypoints || []).map(w => `
  <wpt lat="${w.lat}" lon="${w.lon}">
    <name>${esc(w.name)}</name>
    ${w.desc ? `<desc>${esc(w.desc)}</desc>` : ''}
  </wpt>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="MotoRoute" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${esc(tour.name)}</name></metadata>
  ${waypointsXml}
  ${tracksXml}
</gpx>`;
}

function downloadGPX(tour) {
  const blob = new Blob([buildGPX(tour)], { type: 'application/gpx+xml' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `${tour.name.replace(/\s+/g, '_')}.gpx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* ----------------------------------------------------------
   Map lifecycle
   ---------------------------------------------------------- */

function initMap(tour) {
  const container = document.getElementById('map');
  if (!container) return;

  if (mapInstance) {
    mapInstance.remove();
    mapInstance      = null;
    trackLayers      = [];
    waypointMarkers  = [];
    waypointsVisible = true;
    gpxLayer         = null;
    startMarker      = null;
    endMarker        = null;
  }

  mapInstance = L.map('map', { center: [48.2, 9.5], zoom: 7, zoomControl: true });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(mapInstance);

  const data = normalizeGPXRoute(tour.gpx_route);
  if (data) drawGPX(data);
}

function destroyMap() {
  if (mapInstance) { mapInstance.remove(); mapInstance = null; }
  trackLayers     = [];
  waypointMarkers = [];
  gpxLayer        = null;
  startMarker     = null;
  endMarker       = null;
}

/* ----------------------------------------------------------
   Drawing
   ---------------------------------------------------------- */

function drawGPX(data) {
  if (!mapInstance) return;
  clearRouteFromMap();

  const allBounds = [];

  data.tracks.forEach((track, i) => {
    if (!track.points.length) return;
    const color = track.color || TRACK_COLORS[i % TRACK_COLORS.length];

    const layer = L.polyline(track.points, {
      color, weight: 4.5, opacity: 0.95, lineJoin: 'round',
    }).addTo(mapInstance);

    layer.bindTooltip(track.name, { sticky: true, direction: 'top' });

    const mkDot = (c, size = 12) => L.divIcon({
      className: '', iconSize: [size, size], iconAnchor: [size/2, size/2],
      html: `<div style="background:${c};width:${size}px;height:${size}px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.5)"></div>`,
    });
    L.marker(track.points[0], { icon: mkDot('#fff', 12), zIndexOffset: 10 })
      .addTo(mapInstance).bindPopup(`<strong>Start:</strong> ${esc(track.name)}`);
    L.marker(track.points[track.points.length - 1], { icon: mkDot(color, 12), zIndexOffset: 10 })
      .addTo(mapInstance).bindPopup(`<strong>Ende:</strong> ${esc(track.name)}`);

    trackLayers.push({ layer, name: track.name, color, points: track.points });
    allBounds.push(layer.getBounds());
  });

  (data.waypoints || []).forEach(w => {
    const icon = L.divIcon({
      className: '', iconSize: [26, 34], iconAnchor: [13, 34],
      html: `<div style="filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))">
        <svg viewBox="0 0 24 32" width="26" height="34" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 20 12 20S24 21 24 12C24 5.373 18.627 0 12 0z" fill="#f07800"/>
          <circle cx="12" cy="12" r="5" fill="#fff"/>
        </svg>
      </div>`,
    });

    const popup = `<strong>${esc(w.name)}</strong>${w.desc ? `<br><span style="font-size:12px;color:#888">${esc(w.desc)}</span>` : ''}`;
    const marker = L.marker([w.lat, w.lon], { icon })
      .addTo(mapInstance)
      .bindPopup(popup)
      .bindTooltip(w.name, { sticky: false, direction: 'top', offset: [0, -32] });

    waypointMarkers.push({ marker, name: w.name });
    allBounds.push(L.latLngBounds([[w.lat, w.lon], [w.lat, w.lon]]));
  });

  if (allBounds.length) {
    const combined = allBounds.reduce((acc, b) => acc.extend(b));
    mapInstance.fitBounds(combined, { padding: [40, 40] });
  }
}

function highlightTrack(index) {
  trackLayers.forEach((tl, i) => {
    tl.layer.setStyle({
      weight:  i === index ? 8   : 2.5,
      opacity: i === index ? 1   : 0.3,
    });
    if (i === index) {
      tl.layer.bringToFront();
      tl.layer.openTooltip(tl.layer.getCenter());
    } else {
      tl.layer.closeTooltip();
    }
  });
  waypointMarkers.forEach(wm => {
    wm.marker.setOpacity(0.3);
    wm.marker.closeTooltip();
  });
  const tl = trackLayers[index];
  if (tl) mapInstance.fitBounds(tl.layer.getBounds(), { padding: [60, 60] });
}

function highlightWaypoint(index) {
  trackLayers.forEach(tl => {
    tl.layer.setStyle({ weight: 4.5, opacity: 0.95 });
    tl.layer.closeTooltip();
  });
  waypointMarkers.forEach((wm, i) => {
    wm.marker.setOpacity(i === index ? 1 : 0.3);
    if (i === index) {
      wm.marker.openTooltip();
    } else {
      wm.marker.closeTooltip();
    }
  });
  const wm = waypointMarkers[index];
  if (wm) {
    mapInstance.setView(wm.marker.getLatLng(), 14, { animate: true });
    wm.marker.openPopup();
  }
}

function resetHighlight() {
  trackLayers.forEach(tl => {
    tl.layer.setStyle({ weight: 4.5, opacity: 0.95 });
    tl.layer.closeTooltip();
  });
  waypointMarkers.forEach(wm => {
    wm.marker.setOpacity(1);
    wm.marker.closeTooltip();
  });
}

let waypointsVisible = true;

/* ----------------------------------------------------------
   Distance calculation
   ---------------------------------------------------------- */

/**
 * Haversine distance between two [lat, lon] points in kilometres.
 * @param {[number,number]} a
 * @param {[number,number]} b
 * @returns {number}
 */
function _haversine(a, b) {
  const R  = 6371;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLon = (b[1] - a[1]) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2
          + Math.cos(a[0] * Math.PI / 180)
          * Math.cos(b[0] * Math.PI / 180)
          * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/**
 * Calculate the total distance across all tracks in a parsed GPX object.
 * @param {{ tracks: Array }} data
 * @returns {string}
 */
function calculateTotalDistance(data) {
  return _distanceKm((data.tracks || []).flatMap(t => t.points));
}

/**
 * Calculate the distance of a single track (by index).
 * @param {{ tracks: Array }} data
 * @param {number} trackIndex
 * @returns {string}
 */
function calculateTrackDistance(data, trackIndex) {
  const track = (data.tracks || [])[trackIndex];
  return track ? _distanceKm(track.points) : '';
}

/** Sum haversine distances along a sequence of [lat,lon] points → readable string. */
function _distanceKm(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += _haversine(points[i - 1], points[i]);
  }
  if (total === 0) return '';
  return total >= 10 ? `${Math.round(total)} km` : `${total.toFixed(1)} km`;
}

/**
 * Toggle all waypoint markers on/off.
 * @returns {boolean} new visibility state
 */
function toggleWaypoints() {
  waypointsVisible = !waypointsVisible;
  waypointMarkers.forEach(wm => {
    if (waypointsVisible) {
      wm.marker.addTo(mapInstance);
    } else {
      wm.marker.closePopup();
      wm.marker.closeTooltip();
      mapInstance.removeLayer(wm.marker);
    }
  });
  return waypointsVisible;
}

function clearRouteFromMap() {
  trackLayers.forEach(tl => mapInstance?.removeLayer(tl.layer));
  waypointMarkers.forEach(wm => mapInstance?.removeLayer(wm.marker));
  trackLayers     = [];
  waypointMarkers = [];
  if (gpxLayer)    { mapInstance?.removeLayer(gpxLayer);    gpxLayer    = null; }
  if (startMarker) { mapInstance?.removeLayer(startMarker); startMarker = null; }
  if (endMarker)   { mapInstance?.removeLayer(endMarker);   endMarker   = null; }
}
