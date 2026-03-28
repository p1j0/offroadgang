/* ============================================================
   map.js – Leaflet map management and GPX utilities
   Depends on: state.js (mapInstance, gpxLayer, startMarker, endMarker, state)
   ============================================================ */

/* ----------------------------------------------------------
   Map lifecycle
   ---------------------------------------------------------- */

/**
 * Initialise the Leaflet map inside #map.
 * If the instance already exists, just invalidate its size.
 * @param {object} tour – current tour object
 */
function initMap(tour) {
  const container = document.getElementById('map');
  if (!container) return;

  if (mapInstance) {
    mapInstance.invalidateSize();
    return;
  }

  mapInstance = L.map('map', { center: [48.2, 9.5], zoom: 7, zoomControl: true });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(mapInstance);

  if (tour.gpx_route?.length) drawRoute(tour.gpx_route);
}

/**
 * Tear down the Leaflet map and reset module-level references.
 */
function destroyMap() {
  if (mapInstance) { mapInstance.remove(); mapInstance = null; }
  gpxLayer    = null;
  startMarker = null;
  endMarker   = null;
}

/* ----------------------------------------------------------
   Route drawing
   ---------------------------------------------------------- */

/**
 * Draw a polyline route on the map with start / end markers.
 * Replaces any existing route layer.
 * @param {Array<[number, number]>} points
 */
function drawRoute(points) {
  if (!mapInstance) return;

  // Remove previous layers
  if (gpxLayer)    { mapInstance.removeLayer(gpxLayer);    gpxLayer    = null; }
  if (startMarker) { mapInstance.removeLayer(startMarker); startMarker = null; }
  if (endMarker)   { mapInstance.removeLayer(endMarker);   endMarker   = null; }

  if (!points?.length) return;

  gpxLayer = L.polyline(points, {
    color: '#f07800', weight: 4.5, opacity: 0.95, lineJoin: 'round',
  }).addTo(mapInstance);

  const circleIcon = (color) => L.divIcon({
    className: '',
    iconSize:   [14, 14],
    iconAnchor: [7, 7],
    html: `<div style="
      background:${color};width:14px;height:14px;
      border-radius:50%;border:2px solid #fff;
      box-shadow:0 2px 6px rgba(0,0,0,0.5)
    "></div>`,
  });

  startMarker = L.marker(points[0], { icon: circleIcon('#3dba7b') })
    .addTo(mapInstance).bindPopup('<strong>Start</strong>');
  endMarker = L.marker(points[points.length - 1], { icon: circleIcon('#f07800') })
    .addTo(mapInstance).bindPopup('<strong>Ziel</strong>');

  mapInstance.fitBounds(gpxLayer.getBounds(), { padding: [40, 40] });
}

/**
 * Clear route layers from the map without destroying the map itself.
 */
function clearRouteFromMap() {
  if (gpxLayer)    { mapInstance?.removeLayer(gpxLayer);    gpxLayer    = null; }
  if (startMarker) { mapInstance?.removeLayer(startMarker); startMarker = null; }
  if (endMarker)   { mapInstance?.removeLayer(endMarker);   endMarker   = null; }
}

/* ----------------------------------------------------------
   GPX parsing
   ---------------------------------------------------------- */

/**
 * Parse a GPX XML string and return an array of [lat, lon] pairs.
 * Supports track points, route points and waypoints.
 * @param {string} xml
 * @returns {Array<[number, number]>}
 */
function parseGPX(xml) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');

  let pts = Array.from(doc.querySelectorAll('trkpt'));
  if (!pts.length) pts = Array.from(doc.querySelectorAll('rtept'));
  if (!pts.length) pts = Array.from(doc.querySelectorAll('wpt'));

  return pts
    .map(p => [parseFloat(p.getAttribute('lat')), parseFloat(p.getAttribute('lon'))])
    .filter(([a, b]) => !isNaN(a) && !isNaN(b));
}

/* ----------------------------------------------------------
   GPX generation & download
   ---------------------------------------------------------- */

/**
 * Build a GPX XML string from a tour's route.
 * @param {object} tour
 * @returns {string}
 */
function buildGPX(tour) {
  const pts = (tour.gpx_route || [])
    .map(([lat, lon]) => `      <trkpt lat="${lat}" lon="${lon}"></trkpt>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="MotoRoute" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><n>${esc(tour.name)}</n></metadata>
  <trk>
    <n>${esc(tour.name)}</n>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>`;
}

/**
 * Trigger a browser download of the tour's GPX route.
 * @param {object} tour
 */
function downloadGPX(tour) {
  const blob = new Blob([buildGPX(tour)], { type: 'application/gpx+xml' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `${tour.name.replace(/\s+/g, '_')}.gpx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
