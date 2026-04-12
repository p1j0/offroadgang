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
