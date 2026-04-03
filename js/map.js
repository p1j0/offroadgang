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

// Colors used for DISPLAY (reading GPX files into the app UI)
// Includes non-standard names for convenience
const NAMED_COLORS = {
  Red: '#e04444', DarkRed: '#8b0000',
  Blue: '#4a9eff', DarkBlue: '#00008b', LightBlue: '#87ceeb',
  Green: '#3dba7b', DarkGreen: '#006400',
  Cyan: '#00d4aa', DarkCyan: '#008b8b',
  Magenta: '#c97bff', DarkMagenta: '#8b008b',
  Yellow: '#ffd700', DarkYellow: '#f07800',
  White: '#eeebe4', Black: '#333333',
  LightGray: '#c8c8c8', DarkGray: '#555555',
  Orange: '#f07800',     // kept for parsing legacy files
  Gray: '#7a7880',       // kept for parsing legacy files
  Transparent: null,
};

// ONLY valid Garmin DisplayColor enum values (for GPX export).
// The hex values here represent our display colors mapped to each Garmin name,
// so the nearest-neighbor RGB search picks the right Garmin name for our palette.
// Source: http://www.garmin.com/xmlschemas/GpxExtensions/v3/GpxExtensionsv3.xsd
const GARMIN_EXPORT_COLORS = {
  Black:       '#333333',   // our dark bg
  DarkRed:     '#8b0000',
  DarkGreen:   '#006400',
  DarkYellow:  '#f07800',   // maps to our orange / dark-orange
  DarkBlue:    '#00008b',
  DarkMagenta: '#8b008b',
  DarkCyan:    '#008b8b',
  LightGray:   '#c8c8c8',
  DarkGray:    '#555555',   // our muted gray
  Red:         '#e04444',   // our display red
  Green:       '#3dba7b',   // our display green
  Yellow:      '#ffd700',   // our display yellow
  Blue:        '#4a9eff',   // our display blue
  Magenta:     '#c97bff',   // our display purple
  Cyan:        '#00d4aa',   // our display teal
  White:       '#eeebe4',   // our text color
};

/**
 * Reverse map: hex → valid Garmin DisplayColor name.
 * Built from GARMIN_EXPORT_COLORS only — guarantees only valid enum values are written.
 */
const HEX_TO_GARMIN = Object.fromEntries(
  Object.entries(GARMIN_EXPORT_COLORS).map(([name, hex]) => [hex.toLowerCase(), name])
);

/**
 * Find the closest Garmin named color for a hex string.
 * First tries exact match, then finds nearest by RGB distance.
 * @param {string|null} hex
 * @returns {string|null} Garmin color name, or null if no reasonable match
 */
function _hexToGarminName(hex) {
  if (!hex) return null;
  const h = hex.toLowerCase();
  if (HEX_TO_GARMIN[h]) return HEX_TO_GARMIN[h];

  // Parse target RGB
  const tr = parseInt(h.slice(1,3),16), tg = parseInt(h.slice(3,5),16), tb = parseInt(h.slice(5,7),16);
  if (isNaN(tr)) return null;

  let best = null, bestDist = Infinity;
  for (const [ghex, name] of Object.entries(HEX_TO_GARMIN)) {
    const r = parseInt(ghex.slice(1,3),16), g = parseInt(ghex.slice(3,5),16), b = parseInt(ghex.slice(5,7),16);
    const dist = (tr-r)**2 + (tg-g)**2 + (tb-b)**2;
    if (dist < bestDist) { bestDist = dist; best = name; }
  }
  return best;
}
/* ----------------------------------------------------------
   Garmin waypoint symbols → emoji mapping
   Based on Garmin GPX <sym> element standard values.
   ---------------------------------------------------------- */

const GARMIN_SYMBOLS = {
  // Accommodation
  'Hotel':                  '🏨',
  'Lodge':                  '🏠',
  'Campground':             '⛺',
  'Bed and Breakfast':      '🛏️',

  // Food & Drink
  'Restaurant':             '🍽️',
  'Fast Food':              '🍔',
  'Bar':                    '🍺',
  'Pizza':                  '🍕',
  'Café':                   '☕',
  'Coffee Shop':            '☕',
  'Convenience Store':      '🏪',

  // Transport & Fuel
  'Gas Station':            '⛽',
  'Fuel':                   '⛽',
  'Parking Area':           '🅿️',
  'Parking Garage':         '🅿️',
  'Car Rental':             '🚗',
  'Airport':                '✈️',
  'Ferry':                  '⛴️',
  'Boat Ramp':              '⛵',
  'Bridge':                 '🌉',

  // Services
  'Bank':                   '🏦',
  'ATM':                    '🏧',
  'Post Office':            '📮',
  'Police Station':         '👮',
  'Hospital':               '🏥',
  'Pharmacy':               '💊',
  'Restroom':               '🚻',
  'Shower':                 '🚿',

  // Nature & Outdoor
  'Summit':                 '⛰️',
  'Valley':                 '🏔️',
  'Forest':                 '🌲',
  'Park':                   '🌳',
  'Beach':                  '🏖️',
  'Waterfall':              '💧',
  'Lake':                   '🏞️',
  'Dam':                    '🌊',
  'Scenic Area':            '🌄',
  'Picnic Area':            '🧺',

  // Attractions
  'Museum':                 '🏛️',
  'Church':                 '⛪',
  'Cathedral':              '⛪',
  'Castle':                 '🏰',
  'Monument':               '🗿',
  'Stadium':                '🏟️',
  'Theater':                '🎭',
  'Amusement Park':         '🎡',
  'Zoo':                    '🦁',
  'Winery':                 '🍷',
  'Lighthouse':             '🏠',

  // Sports & Recreation
  'Golf Course':            '⛳',
  'Skiing Area':            '⛷️',
  'Swimming Area':          '🏊',
  'Fitness Center':         '💪',
  'Bicycle Trail':          '🚲',
  'Hiking Trail':           '🥾',
  'Fishing Area':           '🎣',
  'Hunting Area':           '🏹',

  // Shopping
  'Shopping Center':        '🛍️',
  'Supermarket':            '🛒',

  // Navigation
  'Flag':                   '🚩',
  'Flag, Blue':             '🚩',
  'Flag, Green':            '🚩',
  'Flag, Red':              '🚩',
  'Dot, White':             '⚪',
  'Block, Red':             '🔴',
  'Block, Blue':            '🔵',
  'Block, Green':           '🟢',
  'Waypoint':               '📍',
  'Pin, Red':               '📍',
  'Pin, Blue':              '📍',
  'Pin, Green':             '📍',

  // Motorcycle specific
  'Motorcycle':             '🏍️',

  // Fallback
  'default':                '📍',
};

/**
 * Get the emoji for a Garmin <sym> value.
 * Falls back to 📍 if unknown.
 * @param {string|null} sym
 * @returns {string}
 */
function garminSymToEmoji(sym) {
  if (!sym) return '📍';
  return GARMIN_SYMBOLS[sym] || GARMIN_SYMBOLS['default'];
}



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
    sym:  wpt.querySelector('sym')?.textContent?.trim()  || null,
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

  // Use hex escapes to prevent any unicode substitution in the editor
  // \x3c = <   \x3e = >   \x2f = /
  const OT  = '\x3c' + 'name'  + '\x3e';   // <name>
  const CT  = '\x3c' + '\x2f' + 'name' + '\x3e';  // </name>

  const tracksXml = data.tracks.map((t, i) => {
    const color       = t.color || TRACK_COLORS[i % TRACK_COLORS.length];
    const garminColor = _hexToGarminName(color);
    const colorExt    = garminColor
      ? '\n    <extensions>\n      <gpxx:TrackExtension>\n        <gpxx:DisplayColor>' + garminColor + '</gpxx:DisplayColor>\n      </gpxx:TrackExtension>\n    </extensions>'
      : '';
    const pts = t.points
      .map(([lat, lon]) => '<trkpt lat="' + lat + '" lon="' + lon + '"></trkpt>')
      .join('\n      ');
    return '\n  <trk>\n    ' + OT + esc(t.name) + CT
      + colorExt
      + '\n    <trkseg>\n      ' + pts + '\n    </trkseg>\n  </trk>';
  }).join('');

  const waypointsXml = (data.waypoints || []).map(w => {
    const descTag = w.desc ? '\n    <desc>' + esc(w.desc) + '</desc>' : '';
    const symTag  = w.sym  ? '\n    <sym>'  + esc(w.sym)  + '</sym>'  : '';
    return '\n  <wpt lat="' + w.lat + '" lon="' + w.lon + '">\n    '
      + OT + esc(w.name) + CT + descTag + symTag + '\n  </wpt>';
  }).join('');

  const metaTag = OT + esc(tour.name) + CT;

  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<gpx version="1.1" creator="MotoRoute"\n'
    + '  xmlns="http://www.topografix.com/GPX/1/1"\n'
    + '  xmlns:gpxx="http://www.garmin.com/xmlschemas/GpxExtensions/v3"\n'
    + '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n'
    + '  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd '
    + 'http://www.garmin.com/xmlschemas/GpxExtensions/v3 http://www.garmin.com/xmlschemas/GpxExtensionsv3.xsd">\n'
    + '  <metadata>' + metaTag + '</metadata>'
    + waypointsXml + tracksXml
    + '\n</gpx>';
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
    const emoji = garminSymToEmoji(w.sym);
    const icon = L.divIcon({
      className: '', iconSize: [30, 30], iconAnchor: [15, 15],
      html: `<div style="
        font-size:22px;line-height:30px;text-align:center;
        filter:drop-shadow(0 1px 3px rgba(0,0,0,0.6));
        user-select:none;
      ">${emoji}</div>`,
    });

    const symLabel = w.sym ? `<br><span style="font-size:11px;color:#aaa">${esc(w.sym)}</span>` : '';
    const popup = `<strong>${esc(w.name)}</strong>${symLabel}${w.desc ? `<br><span style="font-size:12px;color:#888">${esc(w.desc)}</span>` : ''}`;
    const marker = L.marker([w.lat, w.lon], { icon })
      .addTo(mapInstance)
      .bindPopup(popup)
      .bindTooltip(w.name, { sticky: false, direction: 'top', offset: [0, -10] });

    waypointMarkers.push({ marker, name: w.name, sym: w.sym });
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
