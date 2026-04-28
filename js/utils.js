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
