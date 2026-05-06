/* ============================================================
   utils.js – Shared helper functions
   ============================================================ */

/**
 * Escape HTML special characters to prevent XSS.
 * @param {*} s
 * @returns {string}
 */
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getSurfaceAnalysis(tour) {
  const analysis = tour?.surface_analysis;
  return analysis && typeof analysis === 'object' ? analysis : null;
}

function getTrackSurfaceBreakdown(tour, trackIndex) {
  const tracks = getSurfaceAnalysis(tour)?.tracks;
  if (!Array.isArray(tracks)) return null;
  return tracks.find(t => Number(t.trackNumber) === trackIndex + 1)?.breakdown || null;
}

function getSelectedSurfaceBreakdown(tour) {
  return tour?.surface_display?.breakdown || getSurfaceAnalysis(tour)?.total || null;
}

function buildSurfaceDisplay(tour, source) {
  const analysis = getSurfaceAnalysis(tour);
  if (!analysis?.total) return null;

  if (source?.startsWith('track:')) {
    const trackIndex = parseInt(source.split(':')[1], 10);
    const track = Array.isArray(analysis.tracks)
      ? analysis.tracks.find(t => Number(t.trackNumber) === trackIndex + 1)
      : null;
    return {
      source,
      label: track?.trackName || `Track ${trackIndex + 1}`,
      breakdown: track?.breakdown || analysis.total,
    };
  }

  return {
    source: source === 'manual' ? 'manual' : 'total',
    label: source === 'manual' ? 'Manuell / Gesamt' : 'Gesamt',
    breakdown: analysis.total,
  };
}

function formatOffRoadPercentage(breakdown) {
  const value = Number(breakdown?.offRoadPercentageOfKnownSurface);
  if (!Number.isFinite(value)) return '';
  return `${value.toLocaleString('de-DE', { maximumFractionDigits: 1 })}% Offroad`;
}

function formatSurfaceDistance(kilometers) {
  const value = Number(kilometers);
  if (!Number.isFinite(value) || value <= 0) return '';
  return value >= 10
    ? `${Math.round(value).toLocaleString('de-DE')} km`
    : `${value.toLocaleString('de-DE', { maximumFractionDigits: 1 })} km`;
}

/**
 * Build a collision-aware initials map for a list of user IDs.
 * Uses 1st + 2nd char, escalating to 1st + 3rd, 4th, … when two users share the same result.
 * Example: Rainer/Ralf/Raimund → RA→RI/RL/RI → RN/RL/RM
 *
 * Looks up names from state.profileCache[id].
 * @param {string[]} ids
 * @returns {Object.<string,string>}  id → two-letter initials
 */
function buildInitialsMap(ids) {
  const clean = (uid) => (state.profileCache[uid] || '?').replace(/\s+/g, '').toUpperCase();
  const map   = {};

  function resolve(group, pos) {
    if (pos > 9) return;
    const bucket = {};
    for (const uid of group) {
      const n   = clean(uid);
      const ini = (n[0] || '?') + (n[pos] || n[n.length - 1] || '?');
      map[uid]  = ini;
      (bucket[ini] = bucket[ini] || []).push(uid);
    }
    for (const sub of Object.values(bucket)) {
      if (sub.length > 1) resolve(sub, pos + 1);
    }
  }

  resolve(ids, 1);
  return map;
}

/**
 * Get collision-aware initials for a single user, computed against
 * ALL known users in state.profileCache. This ensures consistency:
 * Mario stays "MR" and Manuel stays "MN" everywhere — independent
 * of which tour, poll or member list they appear in.
 *
 * The map is cached and rebuilt only when profileCache size changes
 * (i.e. when new users have been loaded).
 *
 * @param {string} userId
 * @returns {string} two-letter initials, uppercase
 */
function getInitials(userId) {
  const allIds = Object.keys(state.profileCache || {});
  if (!state._initialsMap || state._initialsMapSize !== allIds.length) {
    state._initialsMap     = buildInitialsMap(allIds);
    state._initialsMapSize = allIds.length;
  }
  return state._initialsMap[userId]
      || (state.profileCache?.[userId] || '?')[0]?.toUpperCase()
      || '?';
}

/**
 * Show a temporary toast notification.
 * @param {string} msg
 * @param {string} [type=''] – '' (accent) | 'error'
 */
function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/**
 * Number of days in a given month.
 * @param {number} y - full year
 * @param {number} m - month index (0-based)
 * @returns {number}
 */
function daysInMonth(y, m) {
  return new Date(y, m + 1, 0).getDate();
}

/**
 * Toggle a button into a loading state (spinner) or restore it.
 * @param {string}  id      – element ID
 * @param {boolean} loading
 * @param {string}  [label] – HTML label when not loading
 */
function setBtn(id, loading, label = '') {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled = loading;
  btn.innerHTML = loading ? '<span class="spinner"></span>' : label;
}

/**
 * Derive a deterministic fake e-mail from a username.
 * Supabase Auth requires an e-mail address; we hide that detail from users.
 * @param {string} username
 * @returns {string}
 */
function usernameToEmail(username) {
  return username.toLowerCase().replace(/[^a-z0-9_.-]/g, '_') + '@motoroute.app';
}

/**
 * Copy a shareable tour invite link to the clipboard.
 * Format: <origin><pathname>#join=TOUR_ID
 * @param {string} tourId
 */
function copyTourLink(tourId) {
  const url = location.origin + location.pathname + '#join=' + tourId;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(() => toast('🔗 Einladungslink kopiert!'));
  } else {
    prompt('Link kopieren:', url);
  }
}

function copyPageLink() {
  const url = location.origin + location.pathname;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(() => toast('🔗 Link kopiert!'));
  } else {
    prompt('Link kopieren:', url);
  }
}

/* ----------------------------------------------------------
   Tab "last seen" tracking – stored in localStorage
   ---------------------------------------------------------- */

/**
 * Key for localStorage: last time the user visited a tab in a tour.
 * @param {string} tourId
 * @param {string} tab
 * @returns {string}
 */
function _seenKey(tourId, tab) {
  return `mr_seen_${tourId}_${tab}`;
}

/**
 * Mark a tab as seen right now.
 * @param {string} tourId
 * @param {string} tab
 */
function markTabSeen(tourId, tab) {
  try { localStorage.setItem(_seenKey(tourId, tab), new Date().toISOString()); } catch(e) {}

  // Home-Karten-Badge optimistisch leeren, damit der SWR-Sofort-Render
  // beim Zurückgehen zur Community-Home keine alte (stale) Markierung mehr zeigt.
  // computeHomeBadges bestätigt das später nochmal mit frischen Server-Daten.
  if (typeof state !== 'undefined' && state.homeBadges?.[tourId]) {
    if (tab === 'chat')      state.homeBadges[tourId].chat      = 0;
    if (tab === 'changelog') state.homeBadges[tourId].changelog = 0;
    const b = state.homeBadges[tourId];
    if ((b.chat || 0) === 0 && (b.changelog || 0) === 0) {
      delete state.homeBadges[tourId];
    }
  }
}

/**
 * Get the Date the user last visited a tab (or epoch if never).
 * @param {string} tourId
 * @param {string} tab
 * @returns {Date}
 */
function getLastSeen(tourId, tab) {
  try {
    const v = localStorage.getItem(_seenKey(tourId, tab));
    return v ? new Date(v) : new Date(0);
  } catch(e) { return new Date(0); }
}

/**
 * Get ISO week number (1–53) for a given date.
 * @param {Date} d
 * @returns {number}
 */
function getISOWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day  = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
}

/* ----------------------------------------------------------
   Emoji Picker
   ---------------------------------------------------------- */

const EMOJI_CATEGORIES = {
  '😊 Smileys': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','😮‍💨','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐'],
  '👍 Gesten': ['👍','👎','👊','✊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','✋','🤚','🖐','🖖','👋','🤏','✍️','💪'],
  '❤️ Herzen': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','🔥','💯','⭐','🌟','✨','💥','💫'],
  '🏍️ Motorrad': ['🏍️','🏁','🛤️','🛣️','🗺️','⛽','🔧','🔩','⚙️','🛞','🏔️','⛰️','🌲','🌳','🏕️','🌄','🌅','🌧️','☀️','⛈️','🌈','💨','🧭','📍','🚀','🏆','🎯','🍺','🍻','☕'],
  '🎉 Feiern': ['🎉','🎊','🎈','🎂','🎁','🥂','🍾','🎵','🎶','🎸','🎺','🥁','🎤','📸','📷','🎬','🎮','🏅','🥇','🥈','🥉','🏆'],
  '⚡ Symbole': ['✅','❌','⚠️','‼️','❓','❗','💬','👀','📌','📎','🔗','📋','📝','🗓️','⏰','🔔','📣','💡','🎯','🛑','🚫','♻️','🆗','🆕','🔝'],
};

function buildEmojiPicker(pickerId) {
  const picker = document.getElementById(pickerId);
  if (!picker) return;

  let html = '<div class="emoji-categories">';
  for (const [cat, emojis] of Object.entries(EMOJI_CATEGORIES)) {
    html += `<div class="emoji-cat-label">${cat}</div>`;
    html += '<div class="emoji-grid">';
    emojis.forEach(e => {
      html += `<span class="emoji-item" data-emoji="${e}">${e}</span>`;
    });
    html += '</div>';
  }
  html += '</div>';
  picker.innerHTML = html;
}

/**
 * Human-readable relative time string (e.g. "vor 2 Tagen").
 * @param {Date} date
 * @returns {string}
 */
function _timeAgo(date) {
  const diff = Math.floor((Date.now() - date) / 1000);
  if (diff < 60)   return 'gerade eben';
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min.`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std.`;
  return `vor ${Math.floor(diff / 86400)} Tag${Math.floor(diff / 86400) === 1 ? '' : 'en'}`;
}

function attachEmojiPicker(toggleId, pickerId, inputId) {
  const toggle = document.getElementById(toggleId);
  const picker = document.getElementById(pickerId);
  const input  = document.getElementById(inputId);
  if (!toggle || !picker || !input) return;

  buildEmojiPicker(pickerId);

  toggle.addEventListener('click', () => {
    const open = picker.style.display === 'none';
    picker.style.display = open ? 'block' : 'none';
  });

  picker.addEventListener('click', e => {
    const emoji = e.target.dataset?.emoji;
    if (!emoji) return;
    const pos = input.selectionStart || input.value.length;
    input.value = input.value.slice(0, pos) + emoji + input.value.slice(pos);
    input.focus();
    input.setSelectionRange(pos + emoji.length, pos + emoji.length);
  });

  // Close picker when clicking outside
  document.addEventListener('click', e => {
    if (!picker.contains(e.target) && e.target !== toggle) {
      picker.style.display = 'none';
    }
  });
}

/* ----------------------------------------------------------
   Offline Guard
   Intercepts all write fetch calls when the device is offline.
   Supabase JS uses window.fetch internally, so this covers
   all database writes, edge function calls and Cloudinary
   uploads in one place — no per-function changes needed.
   ---------------------------------------------------------- */
(function () {
  const _origFetch = window.fetch;
  window.fetch = function (resource, init) {
    const method = ((init && init.method) || 'GET').toUpperCase();
    if (!navigator.onLine && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
      toast('📵 Offline – diese Aktion ist nicht möglich', 'error');
      return Promise.reject(new Error('APP_OFFLINE'));
    }
    return _origFetch.apply(this, arguments);
  };
}());
