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
