/* ============================================================
   api.js – All Supabase database operations
   Depends on: config.js (sb), state.js (state)
   ============================================================ */

// Home-Liste: route_metadata absichtlich ausgelassen — die Tourenkarten
// brauchen es nicht. route_metadata.preview ist 6–25 KB pro Tour, das
// summiert sich auf ~120 KB pro Home-Aufruf für nichts.
const TOUR_LIST_SELECT = [
  'id',
  'community_id',
  'admin_id',
  'co_admin_ids',
  'name',
  'date',
  'end_date',
  'destination',
  'description',
  'distance',
  'surface_display',
  'created_at',
].join(',');

// Detail-View: zusätzlich route_metadata (für Mini-Map-Preview im Overview-Tab)
// und surface_analysis (für die volle Surface-Aufschlüsselung).
const TOUR_DETAIL_SELECT = [
  TOUR_LIST_SELECT,
  'route_metadata',
  'surface_analysis',
  'surface_analysis_updated_at',
].join(',');

const TOUR_MESSAGE_SELECT = 'id,tour_id,user_id,username,text,created_at';
const TOUR_CHANGELOG_SELECT = 'id,tour_id,user_id,username,field,old_value,new_value,created_at';
const TOUR_INITIAL_LIMIT = 50;

function _cachedRouteFields(tourId) {
  if (!tourId) return null;
  const sources = [
    state.currentTour,
    ...(state.tours || []),
    ...(state.communityToursGpx || []),
  ];
  return sources.find(t => t?.id === tourId && t.gpx_route) || null;
}

/**
 * Lightweight fingerprint of route_metadata.
 * Ändert sich wenn ein neuer GPX hochgeladen oder gelöscht wurde.
 */
function _routeFingerprint(rm) {
  if (!rm) return '';
  return `${rm.trackCount || 0}:${rm.waypointCount || 0}:${rm.totalDistance || 0}`;
}

function _preserveCachedRoute(tour) {
  const cached = _cachedRouteFields(tour?.id);
  if (!tour || !cached) return tour;

  // Home-Liste lädt route_metadata absichtlich nicht (Egress-Optimierung).
  // In dem Fall: gpx_route NICHT mit-mergen — es würde sonst in state.tours[i]
  // landen und beim Persist nach localStorage 800 KB pro Tour wegfressen.
  // Auch keine Stale-Detection in diesem Pfad (würde fälschlich triggern).
  const hasFreshMeta = !!tour.route_metadata;
  if (!hasFreshMeta) {
    return tour; // Home-Pfad: nichts mergen, GPX bleibt nur in currentTour
  }

  // Detail-Pfad: voller route_metadata-Vergleich
  const newFp    = _routeFingerprint(tour.route_metadata);
  const cachedFp = _routeFingerprint(cached.route_metadata);
  const gpxStale = newFp !== cachedFp;

  if (gpxStale) {
    state._staleGpxTourIds = state._staleGpxTourIds || new Set();
    state._staleGpxTourIds.add(tour.id);
    if (typeof gpxCacheDelete === 'function') {
      gpxCacheDelete(tour.id); // fire & forget
    }
  }

  return {
    ...tour,
    gpx_route:        gpxStale ? null : cached.gpx_route,
    route_metadata:   tour.route_metadata,
    surface_analysis: gpxStale ? null : (tour.surface_analysis || cached.surface_analysis),
    surface_display:  gpxStale ? null : (tour.surface_display  || cached.surface_display),
  };
}

function _preserveCachedRoutes(tours) {
  return (tours || []).map(_preserveCachedRoute);
}

/* ----------------------------------------------------------
   User seen-state (badges / banners)
   ---------------------------------------------------------- */

function _cacheSeenStateRow(row) {
  if (!row?.scope_id || !row?.seen_key || !row?.seen_at) return;
  if (!state.seenState) state.seenState = {};
  const userId = row.user_id || state.currentUser?.id;
  const cacheKey = _seenCacheKey(row.scope_id, row.seen_key, userId);
  const localKey = _seenKey(row.scope_id, row.seen_key, userId);
  const serverDate = new Date(row.seen_at);
  if (!Number.isFinite(serverDate.getTime())) return;

  let value = serverDate;
  try {
    const pendingRaw = localStorage.getItem(_seenPendingKey(row.scope_id, row.seen_key, userId));
    const pending = pendingRaw ? JSON.parse(pendingRaw) : null;
    const pendingDate = new Date(pending?.seenAt || '');
    const pendingAgeMs = Date.now() - Number(pending?.ts || 0);
    if (Number.isFinite(pendingDate.getTime())
      && pendingAgeMs >= 0
      && pendingAgeMs < 30 * 1000
      && pendingDate > serverDate) {
      value = pendingDate;
    }
  } catch(e) {}

  const valueIso = value.toISOString();
  state.seenState[cacheKey] = valueIso;
  try { localStorage.setItem(localKey, valueIso); } catch(e) {}
}

function _seenLoadCacheKey(ids) {
  return `${state.currentUser?.id || 'anon'}\u0002${ids.slice().sort().join('\u0001')}`;
}

const SEEN_STATE_CACHE_MS = 15 * 1000;
const _seenStateLoadCache = new Map();
const _seenStateLoadInflight = new Map();

async function loadSeenStates(scopeIds) {
  if (!state.currentUser || !navigator.onLine) return;
  const ids = [...new Set((Array.isArray(scopeIds) ? scopeIds : [scopeIds]).filter(Boolean).map(String))];
  if (!ids.length) return;
  const cacheKey = _seenLoadCacheKey(ids);
  const now = Date.now();
  const cachedAt = _seenStateLoadCache.get(cacheKey) || 0;
  if (now - cachedAt < SEEN_STATE_CACHE_MS) return;
  if (_seenStateLoadInflight.has(cacheKey)) return _seenStateLoadInflight.get(cacheKey);

  const loadPromise = (async () => {
    const { data, error } = await sb
      .from('user_seen_state')
      .select('user_id,scope_id,seen_key,seen_at')
      .eq('user_id', state.currentUser.id)
      .in('scope_id', ids);

    if (error) {
      console.warn('[seen_state] load failed:', error.message);
      return;
    }
    const returned = new Set((data || []).map(row => `${row.scope_id}\u0001${row.seen_key}`));
    (data || []).forEach(_cacheSeenStateRow);
    for (const scopeId of ids) {
      _clearMissingServerSeenRows(scopeId, returned);
    }
    _seenStateLoadCache.set(cacheKey, Date.now());
  })().finally(() => {
    _seenStateLoadInflight.delete(cacheKey);
  });

  _seenStateLoadInflight.set(cacheKey, loadPromise);
  return loadPromise;
}

async function saveSeenState(scopeId, seenKey, seenAt = new Date().toISOString()) {
  if (!state.currentUser || !navigator.onLine || !scopeId || !seenKey) return;
  const currentSeen = getLastSeen(scopeId, seenKey);
  if (currentSeen > new Date(seenAt)) seenAt = currentSeen.toISOString();
  const row = {
    user_id: state.currentUser.id,
    scope_id: String(scopeId),
    seen_key: String(seenKey),
    seen_at: seenAt,
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb
    .from('user_seen_state')
    .upsert(row, { onConflict: 'user_id,scope_id,seen_key' });
  if (error) throw new Error(error.message);
  try { localStorage.removeItem(_seenPendingKey(scopeId, seenKey)); } catch(e) {}
  _cacheSeenStateRow(row);
  _invalidateSeenStateLoadCache([scopeId]);
}

async function saveSeenStatesBulk(items = []) {
  if (!state.currentUser || !navigator.onLine || !items.length) return;
  const newestByKey = new Map();
  for (const item of items) {
    if (!item?.scopeId || !item?.seenKey || !item?.seenAt) continue;
    const key = `${item.scopeId}\u0001${item.seenKey}`;
    const prev = newestByKey.get(key);
    if (!prev || new Date(item.seenAt) > new Date(prev.seenAt)) newestByKey.set(key, item);
  }
  const rows = [...newestByKey.values()].map(item => ({
    user_id: state.currentUser.id,
    scope_id: String(item.scopeId),
    seen_key: String(item.seenKey),
    seen_at: item.seenAt,
    updated_at: new Date().toISOString(),
  }));
  if (!rows.length) return;
  const { error } = await sb
    .from('user_seen_state')
    .upsert(rows, { onConflict: 'user_id,scope_id,seen_key' });
  if (error) throw new Error(error.message);
  rows.forEach(_cacheSeenStateRow);
  _invalidateSeenStateLoadCache(rows.map(row => row.scope_id));
}

function _invalidateSeenStateLoadCache(scopeIds = []) {
  const ids = new Set((Array.isArray(scopeIds) ? scopeIds : [scopeIds]).map(String));
  for (const key of [..._seenStateLoadCache.keys()]) {
    const parts = key.split('\u0001');
    if (parts.some(part => ids.has(part))) _seenStateLoadCache.delete(key);
  }
}

function _clearMissingServerSeenRows(scopeId, returned) {
  const userId = state.currentUser?.id;
  if (!userId) return;
  for (const seenKey of LEGACY_SEEN_KEYS) {
    if (returned.has(`${scopeId}\u0001${seenKey}`)) continue;
    let keepPending = false;
    try {
      const pendingRaw = localStorage.getItem(_seenPendingKey(scopeId, seenKey, userId));
      const pending = pendingRaw ? JSON.parse(pendingRaw) : null;
      const pendingAgeMs = Date.now() - Number(pending?.ts || 0);
      keepPending = pendingAgeMs >= 0 && pendingAgeMs < 30 * 1000;
    } catch(e) {}
    if (keepPending) continue;
    delete state.seenState?.[_seenCacheKey(scopeId, seenKey, userId)];
    try { localStorage.removeItem(_seenKey(scopeId, seenKey, userId)); } catch(e) {}
  }
}

/* ----------------------------------------------------------
   Home data
   ---------------------------------------------------------- */

/**
 * Load all tours + the current user's memberships and cache admin usernames.
 */
async function loadHomeData() {
  const cid = state.currentCommunityId;

  // Offline + Daten für diese Community bereits geladen → State behalten
  if (!navigator.onLine && state._loadedHomeForCid === cid && state.tours) {
    return;
  }

  // Load only list metadata. Full GPX JSON is fetched lazily for tour detail
  // or the planning map, otherwise every home render burns PostgREST egress.
  const toursRes = await sb.from('tours').select(TOUR_LIST_SELECT)
    .eq('community_id', cid)
    .order('date', { ascending: true });

  state.tours = _preserveCachedRoutes(toursRes.data || []);
  if (!state.calMonth) state.calMonth = new Date();

  if (!state.tours.length) {
    state.myTourIds   = new Set();
    state.memberCounts = {};
    state.tourMemberIds = {};
    state.homeBadges   = {};
    state._loadedHomeForCid = cid;
    return;
  }

  const tourIds = state.tours.map(t => t.id);

  // Load memberships and member counts filtered to this community's tours
  const [membershipsRes, memberCountsRes] = await Promise.all([
    sb.from('tour_members').select('tour_id').eq('user_id', state.currentUser.id).in('tour_id', tourIds),
    sb.from('tour_members').select('tour_id, user_id').in('tour_id', tourIds),
  ]);

  const memberIds = (membershipsRes.data || []).map(m => m.tour_id);
  const adminIds  = state.tours
    .filter(t => t.admin_id === state.currentUser.id)
    .map(t => t.id);

  state.myTourIds = new Set([...memberIds, ...adminIds]);

  // Build per-tour member id list AND counts in one pass.
  // Respect any pending local kicks so the home screen avatar stack
  // doesn't flicker the removed member back in while the DB catch-up races.
  state.memberCounts  = {};
  state.tourMemberIds = {};
  (memberCountsRes.data || []).forEach(m => {
    const kickedHere = state._kickedMembers?.[m.tour_id];
    if (kickedHere?.has(m.user_id)) return; // still pending → skip
    state.memberCounts[m.tour_id] = (state.memberCounts[m.tour_id] || 0) + 1;
    if (!state.tourMemberIds[m.tour_id]) state.tourMemberIds[m.tour_id] = [];
    state.tourMemberIds[m.tour_id].push(m.user_id);
  });

  // Cache admin usernames AND member usernames in one fetch
  const allNeededIds = new Set(state.tours.map(t => t.admin_id));
  Object.values(state.tourMemberIds).forEach(arr => arr.forEach(id => allNeededIds.add(id)));
  const uncached = [...allNeededIds].filter(id => !state.profileCache[id]);
  if (uncached.length) {
    const { data: profs } = await sb.from('profiles').select('id,username').in('id', uncached);
    (profs || []).forEach(p => { state.profileCache[p.id] = p.username; });
  }

  await computeHomeBadges();
  state._loadedHomeForCid = cid;

  // GPX-Cache aufräumen: Tour-IDs die wir nicht mehr sehen → IndexedDB
  // Eintrag löschen. Fire-and-forget, blockiert nicht.
  if (typeof gpxCacheCleanup === 'function') {
    gpxCacheCleanup((state.tours || []).map(t => t.id));
  }
}

/**
 * Compute unread chat + changelog counts for each of the user's tours.
 * Uses the same localStorage last-seen timestamps as the in-tour tab badges.
 */
async function computeHomeBadges() {
  state.homeBadges = {};
  const myTourIds = [...state.myTourIds];
  if (!myTourIds.length) return;
  await loadSeenStates(myTourIds);

  const chatSeen = {};
  const changelogSeen = {};
  myTourIds.forEach(tourId => {
    chatSeen[tourId] = getLastSeen(tourId, 'chat').toISOString();
    changelogSeen[tourId] = getLastSeen(tourId, 'changelog').toISOString();
  });

  const { data, error } = await sb.rpc('get_home_badges', {
    p_tour_ids: myTourIds,
    p_chat_seen: chatSeen,
    p_changelog_seen: changelogSeen,
  });
  if (error) {
    console.warn('[home badges]', error.message);
    return;
  }

  (data || []).forEach(row => {
    const chat = Number(row.chat_count || 0);
    const changelog = Number(row.changelog_count || 0);
    if (chat > 0 || changelog > 0) state.homeBadges[row.tour_id] = { chat, changelog };
  });
}

/* ----------------------------------------------------------
   Tour detail data
   ---------------------------------------------------------- */

/**
 * Load a single tour, its members, messages and plan dates.
 * Populates state.currentTour / tourMembers / tourMessages / tourPlanDates.
 * @param {string} tourId
 */
async function loadTourData(tourId) {
  const [tourRes, membersRes, msgsRes, datesRes, changelogRes] = await Promise.all([
    sb.from('tours').select(TOUR_DETAIL_SELECT).eq('id', tourId).single(),
    sb.from('tour_members').select('user_id').eq('tour_id', tourId),
    sb.from('messages').select(TOUR_MESSAGE_SELECT).eq('tour_id', tourId).order('created_at', { ascending: false }).limit(TOUR_INITIAL_LIMIT),
    sb.from('plan_dates').select('*').eq('tour_id', tourId).order('date', { ascending: true }),
    sb.from('change_log').select(TOUR_CHANGELOG_SELECT).eq('tour_id', tourId).order('created_at', { ascending: false }).limit(TOUR_INITIAL_LIMIT),
  ]);

  state.currentTour    = _preserveCachedRoute(tourRes.data);
  state.tourMessages   = (msgsRes.data || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  state.tourPlanDates  = datesRes.data     || [];
  state.tourChangelog  = changelogRes.data || [];

  // Cache usernames we haven't seen yet
  const memberUserIds = (membersRes.data || []).map(m => m.user_id);
  const allIds = [...new Set([
    ...(state.currentTour?.admin_id ? [state.currentTour.admin_id] : []),
    ...memberUserIds,
  ].filter(id => !state.profileCache[id]))];

  if (allIds.length) {
    const { data: profs } = await sb.from('profiles').select('id,username').in('id', allIds);
    (profs || []).forEach(p => { state.profileCache[p.id] = p.username; });
  }

  // Build sorted member list: admin first, then others.
  // Apply any pending local kicks so a concurrent or delayed loadTourData
  // can't race-overwrite a just-kicked member back into the list.
  const adminId  = state.currentTour?.admin_id;
  const kickedIds = state._kickedMembers?.[tourId] || new Set();

  state.tourMembers = [
    ...(adminId && !kickedIds.has(adminId) ? [{
      user_id:  adminId,
      username: state.profileCache[adminId] || 'Admin',
      isAdmin:  true,
    }] : []),
    ...(membersRes.data || [])
      .filter(m => m.user_id !== adminId && !kickedIds.has(m.user_id))
      .map(m => ({
        user_id:  m.user_id,
        username: state.profileCache[m.user_id] || 'Unbekannt',
        isAdmin:  false,
      })),
  ];

  // Once DB confirms a kicked member is truly gone, remove them from the pending set
  if (state._kickedMembers?.[tourId]) {
    state._kickedMembers[tourId].forEach(id => {
      if (!(membersRes.data || []).some(m => m.user_id === id)) {
        state._kickedMembers[tourId].delete(id);
      }
    });
  }

  if (state.currentTour?.date) {
    state.tourCalMonth = new Date(state.currentTour.date + 'T12:00:00');
  }

  await loadSeenStates([tourId]);
  computeTabBadges(tourId);
}

/**
 * Compute unread counts/previews for each tab based on last-seen timestamps.
 * Populates state.tabBadges.
 * @param {string} tourId
 */
function computeTabBadges(tourId) {
  state.tabBadges = {};

  /* ── Chat ── */
  const seenChat = getLastSeen(tourId, 'chat');
  const newMsgs  = state.tourMessages.filter(m => new Date(m.created_at) > seenChat);
  if (newMsgs.length) {
    state.tabBadges.chat = newMsgs.map(m => ({
      text: `${m.username}: ${m.text.length > 60 ? m.text.slice(0, 60) + '…' : m.text}`,
      time: new Date(m.created_at),
    }));
  }

  /* ── Changelog ── */
  const seenLog  = getLastSeen(tourId, 'changelog');
  const newLog   = _dedupeLogEntries(state.tourChangelog.filter(e => new Date(e.created_at) > seenLog));
  if (newLog.length) {
    state.tabBadges.changelog = newLog.map(e => ({
      text: `${e.username} → ${e.field}`,
      time: new Date(e.created_at),
    }));
  }

  /* ── Info (tour data changes since last visit) ── */
  const seenInfo = getLastSeen(tourId, 'info');
  const infoLog  = _dedupeLogEntries(state.tourChangelog.filter(e => new Date(e.created_at) > seenInfo));
  if (infoLog.length) {
    state.tabBadges.info = infoLog.map(e => ({
      text: `${e.field}: ${e.new_value || '—'}`,
      time: new Date(e.created_at),
    }));
  }

  /* ── Media ── */
  const seenMedia = getLastSeen(tourId, 'media');
  const newMedia  = state.tourMedia.filter(m => new Date(m.created_at) > seenMedia);
  if (newMedia.length) {
    state.tabBadges.media = newMedia.map(m => ({
      text: `${m.username}: ${m.media_type === 'youtube' ? 'YouTube' : m.media_type}`,
      time: new Date(m.created_at),
    }));
  }
}

function _dedupeLogEntries(entries, windowMs = 2 * 60 * 1000) {
  const seen = new Map();
  return (entries || []).filter(e => {
    const key = [
      e.tour_id || '',
      e.user_id || e.username || '',
      e.field || '',
      e.old_value || '',
      e.new_value || '',
    ].join('\u0001');
    const ts = new Date(e.created_at).getTime();
    const previousTs = seen.get(key);
    if (Number.isFinite(previousTs) && Number.isFinite(ts) && Math.abs(previousTs - ts) <= windowMs) {
      return false;
    }
    seen.set(key, ts);
    return true;
  });
}

/**
 * Reload only the changelog for the current tour.
 */
async function loadChangelog() {
  const tourId = state.currentTourId;
  const cached = state.tourChangelog;
  const newest = cached?.[0]?.created_at; // list is sorted desc

  // Wenn wir lokal schon was haben: HEAD-Check ob es überhaupt Neueres gibt.
  // Spart den vollen GET (LIMIT 50) wenn nichts dazu kam.
  if (newest && navigator.onLine) {
    const head = await sb
      .from('change_log')
      .select('id', { head: true, count: 'exact' })
      .eq('tour_id', tourId)
      .gt('created_at', newest);
    if ((head.count || 0) === 0) return; // nichts Neues → Cache reicht
    // Nur die neuen Einträge holen, nicht alles neu:
    const { data: deltaRows } = await sb
      .from('change_log')
      .select(TOUR_CHANGELOG_SELECT)
      .eq('tour_id', tourId)
      .gt('created_at', newest)
      .order('created_at', { ascending: false });
    if (deltaRows?.length) {
      // Vorne anhängen, auf TOUR_INITIAL_LIMIT kappen
      state.tourChangelog = [...deltaRows, ...cached].slice(0, TOUR_INITIAL_LIMIT);
    }
    return;
  }

  // Kein Cache (Erstaufruf) oder offline → Vollladen
  const { data } = await sb
    .from('change_log')
    .select(TOUR_CHANGELOG_SELECT)
    .eq('tour_id', tourId)
    .order('created_at', { ascending: false })
    .limit(TOUR_INITIAL_LIMIT);
  state.tourChangelog = data || [];
}

/**
 * Write a single changelog entry.
 * @param {string} field
 * @param {string} oldValue
 * @param {string} newValue
 */
const _recentLogWrites = new Map();
const LOG_DEDUPE_WINDOW_MS = 5000;

async function logChange(field, oldValue, newValue) {
  if (String(oldValue || '') === String(newValue || '')) return;

  const now = Date.now();
  for (const [key, ts] of _recentLogWrites) {
    if (now - ts > LOG_DEDUPE_WINDOW_MS) _recentLogWrites.delete(key);
  }

  const logKey = [
    state.currentTourId || '',
    state.currentUser?.id || state.currentUser?.username || '',
    field || '',
    String(oldValue || ''),
    String(newValue || ''),
  ].join('\u0001');

  if (_recentLogWrites.has(logKey)) return;
  _recentLogWrites.set(logKey, now);

  const { error } = await sb.from('change_log').insert({
    tour_id:   state.currentTourId,
    user_id:   state.currentUser.id,
    username:  state.currentUser.username,
    field,
    old_value: String(oldValue || ''),
    new_value: String(newValue || ''),
  });
  if (error) {
    _recentLogWrites.delete(logKey);
    throw new Error(error.message);
  }
}

/**
 * Refresh only the messages for the current tour.
 */
async function loadMessages() {
  const tourId = state.currentTourId;
  const cached = state.tourMessages || [];
  // tourMessages ist asc sortiert → newest ist last
  const newest = cached.length ? cached[cached.length - 1].created_at : null;

  if (newest && navigator.onLine) {
    const head = await sb
      .from('messages')
      .select('id', { head: true, count: 'exact' })
      .eq('tour_id', tourId)
      .gt('created_at', newest);
    if ((head.count || 0) === 0) return; // keine neuen Nachrichten

    const { data: deltaRows } = await sb
      .from('messages')
      .select(TOUR_MESSAGE_SELECT)
      .eq('tour_id', tourId)
      .gt('created_at', newest)
      .order('created_at', { ascending: true });
    if (deltaRows?.length) {
      // Anhängen, dann auf TOUR_INITIAL_LIMIT kappen (älteste fallen raus)
      const merged = [...cached, ...deltaRows];
      state.tourMessages = merged.slice(-TOUR_INITIAL_LIMIT);
    }
    return;
  }

  // Erstaufruf oder offline → Vollladen
  const { data } = await sb
    .from('messages')
    .select(TOUR_MESSAGE_SELECT)
    .eq('tour_id', tourId)
    .order('created_at', { ascending: false })
    .limit(TOUR_INITIAL_LIMIT);
  state.tourMessages = (data || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

/* ----------------------------------------------------------
   Tour mutations
   ---------------------------------------------------------- */

/**
 * Create a new tour (admin = current user).
 * @param {object} data – tour fields (without admin_id)
 * @returns {object} created tour row
 */
async function createTour(data) {
  const { data: t, error } = await sb
    .from('tours')
    .insert({ ...data, admin_id: state.currentUser.id, community_id: state.currentCommunityId })
    .select()
    .single();
  if (error) throw new Error(error.message);
  // Push an alle Community-Mitglieder
  getCommunityMemberIds().then(ids =>
    sendPushToUsers(ids, '🏍️ Neue Tour',
      `${state.currentUser.username} hat eine neue Tour erstellt: ${data.name}`, '/')
  );
  return t;
}

/**
 * Join a tour after password check.
 * @param {string} tourId
 * @param {string} password
 */
async function joinTour(tourId) {
  const { error } = await sb
    .from('tour_members')
    .insert({ tour_id: tourId, user_id: state.currentUser.id });

  const alreadyMember = !!error && error.message.includes('duplicate');
  if (error && !alreadyMember) throw new Error(error.message);
  state.myTourIds.add(tourId);
  if (alreadyMember) return;

  // Log join
  const savedId = state.currentTourId;
  state.currentTourId = tourId;
  await logChange('Teilnehmer beigetreten', '', state.currentUser.username);
  state.currentTourId = savedId;
}

/** Human-readable labels for changelog field names. */
const FIELD_LABELS = {
  name:        'Tour-Name',
  date:        'Startdatum',
  end_date:    'Enddatum',
  destination: 'Ziel / Region',
  description: 'Beschreibung',
  distance:    'Distanz',
  surface_analysis: 'Offroad-Anteil',
  surface_display: 'Offroad-Anteil',
};

/**
 * Update editable tour fields and write changelog entries for each change.
 * @param {object} updates
 */
async function updateTourInfo(updates) {
  const { error } = await sb
    .from('tours')
    .update(updates)
    .eq('id', state.currentTourId);
  if (error) throw new Error(error.message);

  // Log every changed field
  const logPromises = Object.entries(updates).filter(([key]) => key !== 'surface_display').map(([key, newVal]) => {
    const oldVal = state.currentTour?.[key];
    const label  = FIELD_LABELS[key] || key;
    return logChange(label, oldVal, newVal);
  });
  await Promise.allSettled(logPromises);

  if (state.currentTour) Object.assign(state.currentTour, updates);
  // Push an Tour-Mitglieder
  const changedFields = Object.keys(updates).map(k => FIELD_LABELS[k] || k).join(', ');
  getTourMemberIdsIncludingAdmin().then(ids =>
    sendPushToUsers(ids, '✏️ Tour geändert',
      `${state.currentUser.username} hat die Tour aktualisiert: ${changedFields}`, '/')
  );
}

/**
 * Promote a tour member to co-admin.
 * @param {string} userId
 */
async function promoteToAdmin(userId) {
  const current = state.currentTour.co_admin_ids || [];
  if (current.includes(userId)) return;
  const updated = [...current, userId];
  const { error } = await sb
    .from('tours')
    .update({ co_admin_ids: updated })
    .eq('id', state.currentTourId);
  if (error) throw new Error(error.message);
  state.currentTour.co_admin_ids = updated;
  await logChange('Co-Admin hinzugefügt', '', state.profileCache[userId] || userId);
}

/**
 * Remove co-admin rights from a member.
 * @param {string} userId
 */
async function demoteAdmin(userId) {
  const current = state.currentTour.co_admin_ids || [];
  const updated = current.filter(id => id !== userId);
  const { error } = await sb
    .from('tours')
    .update({ co_admin_ids: updated })
    .eq('id', state.currentTourId);
  if (error) throw new Error(error.message);
  state.currentTour.co_admin_ids = updated;
  await logChange('Co-Admin entfernt', state.profileCache[userId] || userId, '');
}

/**
 * Permanently delete the current tour (admin only).
 * Supabase cascades deletes to members, messages and plan_dates.
 */
async function deleteTour() {
  const { error } = await sb
    .from('tours')
    .delete()
    .eq('id', state.currentTourId);
  if (error) throw new Error(error.message);
  state.myTourIds.delete(state.currentTourId);
  state.tours = state.tours.filter(t => t.id !== state.currentTourId);
}

/**
 * Remove the current user from a tour they joined (non-admin).
 */
async function leaveTour() {
  const { error } = await sb
    .from('tour_members')
    .delete()
    .eq('tour_id', state.currentTourId)
    .eq('user_id', state.currentUser.id);
  if (error) throw new Error(error.message);
  await logChange('Teilnehmer verlassen', state.currentUser.username, '');
  state.myTourIds.delete(state.currentTourId);
  state.tours = state.tours.filter(t => t.id !== state.currentTourId);
}

async function kickTourMember(userId) {
  const { error } = await sb
    .from('tour_members')
    .delete()
    .eq('tour_id', state.currentTourId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  const username = state.profileCache[userId] || userId;
  await logChange('Teilnehmer entfernt', username, '');

  // Register in pending-kick map so that any concurrent loadTourData call
  // (triggered by the initial navigateTo SWR background fetch) cannot
  // race-overwrite this kick back into the members list.
  state._kickedMembers = state._kickedMembers || {};
  state._kickedMembers[state.currentTourId] = state._kickedMembers[state.currentTourId] || new Set();
  state._kickedMembers[state.currentTourId].add(userId);

  // Update local state immediately so re-renders don't flicker the member back in
  state.tourMembers = state.tourMembers.filter(m => m.user_id !== userId);

  // Also remove from tourMemberIds so home-screen counts stay correct
  const tid = state.currentTourId;
  if (state.tourMemberIds?.[tid]) {
    state.tourMemberIds[tid] = state.tourMemberIds[tid].filter(id => id !== userId);
  }
  if (state.memberCounts?.[tid] && state.memberCounts[tid] > 0) {
    state.memberCounts[tid]--;
  }

  // Explicitly invalidate the SW API cache for tour_members so that the
  // SWR re-fetch in navigateTo doesn't load the stale cached GET response
  // that still contains the kicked member (belt-and-suspenders alongside
  // the SW write-handler that should already do this on DELETE).
  if (typeof _invalidateSWTable === 'function') {
    await _invalidateSWTable('tour_members');
  }
}

/* ----------------------------------------------------------
   Messages
   ---------------------------------------------------------- */

/**
 * Insert a chat message and return the new row.
 * @param {string} text
 * @returns {object}
 */
async function sendMessage(text) {
  const { data, error } = await sb
    .from('messages')
    .insert({
      tour_id:  state.currentTourId,
      user_id:  state.currentUser.id,
      username: state.currentUser.username,
      text,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  // Push an Tour-Mitglieder (fire & forget)
  getTourMemberIdsIncludingAdmin().then(ids =>
    sendPushToUsers(ids, `💬 ${state.currentUser.username}`,
      text.length > 80 ? text.slice(0, 80) + '…' : text, '/')
  );
  return data;
}

/* ----------------------------------------------------------
   Plan dates
   ---------------------------------------------------------- */

/**
 * Add a planning date to the current tour.
 * @param {string} date  – ISO date string (YYYY-MM-DD)
 * @param {string} label – optional description
 */
async function addPlanDate(date, label, type = 'sonstiger', mapsLink = '', meetingTime = '') {
  const { data, error } = await sb
    .from('plan_dates')
    .insert({
      tour_id:      state.currentTourId,
      date,
      label,
      type,
      maps_link:    mapsLink    || null,
      meeting_time: meetingTime || null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  state.tourPlanDates.push(data);
  const display = label ? `${date} (${label})` : date;
  await logChange('Planungstermin hinzugefügt', '', display);

  if (type === 'treffpunkt') {
    const userId = state.currentUser?.id;
    _notifyTourEvent({
      tour_id:        state.currentTourId,
      event_type:     'treffpunkt',
      actor_user_id:  userId,
      actor_username: state.currentUser?.username || state.profileCache?.[userId] || 'Unbekannt',
      details:        display,
    }).catch(e => console.warn('[notify treffpunkt]', e));
  }
}

async function loadNextTourPlanDates(tourId) {
  // Offline + bereits für diese Tour geladen → State behalten
  if (!navigator.onLine && state._loadedPlanDatesTourId === tourId && state.tourPlanDates) {
    return;
  }

  const { data } = await sb
    .from('plan_dates')
    .select('*')
    .eq('tour_id', tourId)
    .order('date', { ascending: true });
  state.tourPlanDates = data || [];
  state._loadedPlanDatesTourId = tourId;
}

/**
 * Delete a planning date by its UUID.
 * @param {string} id
 */
async function deletePlanDate(id) {
  const pd = state.tourPlanDates.find(d => d.id === id);
  await sb.from('plan_dates').delete().eq('id', id);
  state.tourPlanDates = state.tourPlanDates.filter(d => d.id !== id);
  const display = pd ? (pd.label ? `${pd.date} (${pd.label})` : pd.date) : id;
  await logChange('Planungstermin entfernt', display, '');
}

/* ----------------------------------------------------------
   GPX route
   ---------------------------------------------------------- */

/**
 * Persist a GPX route (array of [lat, lon] pairs) to the DB.
 * @param {Array} route
 */
async function saveGPX(route, gpxText = '') {
  const routeMetadata = typeof buildRouteMetadata === 'function' ? buildRouteMetadata(route) : null;
  const { error } = await sb
    .from('tours')
    .update({
      gpx_route: route,
      route_metadata: routeMetadata,
      surface_analysis: null,
      surface_display: null,
      surface_analysis_updated_at: null,
    })
    .eq('id', state.currentTourId);
  if (error) throw new Error(error.message);
  const hadRoute = !!state.currentTour?.gpx_route;
  if (state.currentTour) {
    state.currentTour.gpx_route = route;
    state.currentTour.route_metadata = routeMetadata;
    state.currentTour.surface_analysis = null;
    state.currentTour.surface_display = null;
    state.currentTour.surface_analysis_updated_at = null;
  }
  // Frischen GPX im IndexedDB-Cache ablegen mit neuem Fingerprint
  if (typeof gpxCachePut === 'function') {
    try { await gpxCachePut(state.currentTourId, route, routeMetadata); } catch (e) {}
  }
  const tracks = route?.tracks?.length || 0;
  const wpts   = route?.waypoints?.length || 0;
  await logChange('Route', hadRoute ? 'Vorherige Route' : '', `${tracks} Track(s), ${wpts} Wegpunkt(e)`);

  // Also log to community changelog so it appears in the Planning Log tab
  const tourName = state.currentTour?.name || 'Tour';
  await logCommunityChange(
    'Neue Route in Tour',
    '',
    `${tourName}: ${tracks} Track(s), ${wpts} Wegpunkt(e)`
  );

  if (gpxText && tracks > 0) {
    try {
      const analysis = await analyzeGPXSurface(gpxText);
      const analyzedAt = new Date().toISOString();
      const surfaceDisplay = { source: 'total', label: 'Gesamt', breakdown: analysis.total };
      const updateRes = await sb
        .from('tours')
        .update({
          surface_analysis: analysis,
          surface_display: surfaceDisplay,
          surface_analysis_updated_at: analyzedAt,
        })
        .eq('id', state.currentTourId);
      if (updateRes.error) throw new Error(updateRes.error.message);
      if (state.currentTour) {
        state.currentTour.surface_analysis = analysis;
        state.currentTour.surface_display = surfaceDisplay;
        state.currentTour.surface_analysis_updated_at = analyzedAt;
      }
      await logChange('Offroad-Anteil', '', formatOffRoadPercentage(analysis.total) || 'Berechnet');
      return { surfaceAnalysis: analysis };
    } catch (e) {
      console.warn('[gpx surface analysis]', e);
      return { surfaceAnalysis: null, surfaceAnalysisError: e };
    }
  }

  return { surfaceAnalysis: null };
}

async function analyzeGPXSurface(gpxText) {
  const { data, error } = await sb.functions.invoke('analyze-gpx-surface', {
    body: {
      gpx: gpxText,
      costing: 'bicycle',
      maxKilometersPerRequest: 80,
      requestDelayMillis: 1100,
    },
  });

  if (error) throw new Error(error.message || 'Offroad-Analyse fehlgeschlagen');
  if (data?.error) throw new Error(data.error);
  return data;
}

/**
 * Remove the GPX route from the current tour.
 */
async function deleteGPX() {
  const { error } = await sb
    .from('tours')
    .update({
      gpx_route: null,
      route_metadata: null,
      surface_analysis: null,
      surface_display: null,
      surface_analysis_updated_at: null,
    })
    .eq('id', state.currentTourId);
  if (error) throw new Error(error.message);
  if (state.currentTour) {
    state.currentTour.gpx_route = null;
    state.currentTour.route_metadata = null;
    state.currentTour.surface_analysis = null;
    state.currentTour.surface_display = null;
    state.currentTour.surface_analysis_updated_at = null;
  }
  // GPX-Cache für diese Tour leeren
  if (typeof gpxCacheDelete === 'function') {
    try { await gpxCacheDelete(state.currentTourId); } catch (e) {}
  }
  await logChange('Route', 'Route vorhanden', 'Gelöscht');
}

/* ----------------------------------------------------------
   User profile
   ---------------------------------------------------------- */

/**
 * Load the current user's full profile (including notification prefs).
 * @returns {object}
 */
async function loadProfile() {
  const { data, error } = await sb
    .from('profiles')
    .select('username, notification_email, notify_chat, notify_changes')
    .eq('id', state.currentUser.id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Save notification preferences + email to the profile.
 * @param {object} updates – { notification_email, notify_chat, notify_changes }
 */
async function saveProfile(updates) {
  const { error } = await sb
    .from('profiles')
    .update(updates)
    .eq('id', state.currentUser.id);
  if (error) throw new Error(error.message);
}

/* ----------------------------------------------------------
   Communities
   ---------------------------------------------------------- */

async function loadCommunities() {
  const { data, error } = await sb
    .from('communities')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name',       { ascending: true });

  // If table doesn't exist yet, show empty list gracefully
  if (error) {
    console.warn('[loadCommunities]', error.message);
    state.communities    = [];
    state.myCommunityIds = new Set();
    state.communityMemberCounts = {};
    return;
  }
  state.communities = data || [];

  const [{ data: memberships }, { data: allMembers }, { data: allTours }] = await Promise.all([
    sb
      .from('community_members')
      .select('community_id')
      .eq('user_id', state.currentUser.id),
    sb
      .from('community_members')
      .select('community_id, user_id'),
    sb
      .from('tours')
      .select('id, community_id')
      .not('community_id', 'is', null),
  ]);

  // Fetch tour members for all community tours in one query
  const tourIds = (allTours || []).map(t => t.id);
  let tourMemberRows = [];
  if (tourIds.length) {
    const { data: tm } = await sb
      .from('tour_members')
      .select('tour_id, user_id')
      .in('tour_id', tourIds);
    tourMemberRows = tm || [];
  }

  // Map tour_id → community_id for lookup
  const tourCommunityMap = {};
  (allTours || []).forEach(t => { tourCommunityMap[t.id] = t.community_id; });

  // Build per-community member sets (deduplicates everything)
  const membersByCommunity = {};
  const ensureSet = (cid) => {
    if (!membersByCommunity[cid]) membersByCommunity[cid] = new Set();
    return membersByCommunity[cid];
  };
  (allMembers || []).forEach(row => ensureSet(row.community_id).add(row.user_id));
  tourMemberRows.forEach(row => {
    const cid = tourCommunityMap[row.tour_id];
    if (cid) ensureSet(cid).add(row.user_id);
  });

  state.communityMemberCounts = {};
  state.communities.forEach(c => {
    const memberSet = ensureSet(c.id);
    memberSet.add(c.admin_id);
    (c.co_admin_ids || []).forEach(id => memberSet.add(id));
    state.communityMemberCounts[c.id] = memberSet.size;
  });

  const adminOf = state.communities
    .filter(c => c.admin_id === state.currentUser.id ||
                 (c.co_admin_ids || []).includes(state.currentUser.id))
    .map(c => c.id);

  const memberOf = (memberships || []).map(m => m.community_id);
  state.myCommunityIds = new Set([...adminOf, ...memberOf]);
}

/**
 * Persist the new community order (site admin only).
 * Reads order from the DOM, updates sort_order in DB.
 * @param {string[]} orderedIds – community IDs in new order
 */
async function saveCommunityOrder(orderedIds) {
  await Promise.all(orderedIds.map((id, i) =>
    sb.from('communities').update({ sort_order: i }).eq('id', id)
  ));
  // Re-sort local state to match
  const map = Object.fromEntries(state.communities.map(c => [c.id, c]));
  state.communities = orderedIds.map(id => map[id]).filter(Boolean);
}

/**
 * Set or clear the user's default community (auto-redirect on login).
 * @param {string|null} communityId
 */
async function updateDefaultCommunity(communityId) {
  await sb.from('profiles')
    .update({ default_community_id: communityId || null })
    .eq('id', state.currentUser.id);
  state.currentUser.defaultCommunityId = communityId || null;
}

async function joinCommunity(communityId, password) {
  const community = state.communities.find(c => c.id === communityId);
  if (!community) throw new Error('Community nicht gefunden.');
  if (community.password !== password) throw new Error('Falsches Passwort!');

  const { error } = await sb
    .from('community_members')
    .insert({ community_id: communityId, user_id: state.currentUser.id });

  if (error && !error.message.includes('duplicate')) throw new Error(error.message);
  state.myCommunityIds.add(communityId);
  state.currentCommunityId = communityId;
  state.currentCommunity   = community;
}

async function leaveCommunity() {
  const { error } = await sb
    .from('community_members')
    .delete()
    .eq('community_id', state.currentCommunityId)
    .eq('user_id', state.currentUser.id);
  if (error) throw new Error(error.message);
  // Log vor dem State-Update, damit currentCommunityId noch gesetzt ist.
  // Ohne diesen Log-Eintrag bleibt das Verlassen der Community im normalen
  // Changelog unsichtbar (Audit-Tabelle hat es zwar, aber Admins sehen sie nicht).
  await logCommunityChange('Mitglied verlassen', state.currentUser.username, '');
  state.myCommunityIds.delete(state.currentCommunityId);
}

async function loadCommunityData(communityId) {
  // Offline + diese Community bereits geladen → State behalten (kein Re-Fetch)
  if (!navigator.onLine && state._loadedCommunityDataId === communityId && state.communityMembers?.length) {
    return;
  }

  const community = state.communities.find(c => c.id === communityId) ||
    (await sb.from('communities').select('*').eq('id', communityId).single()).data;
  if (!community) throw new Error('Community nicht gefunden.');
  state.currentCommunity   = community;
  state.currentCommunityId = communityId;

  // Load community members + tour IDs in parallel (independent queries)
  const [{ data: members }, { data: tourIds }] = await Promise.all([
    sb.from('community_members').select('user_id').eq('community_id', communityId),
    sb.from('tours').select('id').eq('community_id', communityId),
  ]);

  // Load tour members (needs tour IDs from above)
  let tourMemberIds = [];
  if (tourIds?.length) {
    const ids = tourIds.map(t => t.id);
    const { data: tourMembers } = await sb
      .from('tour_members')
      .select('user_id')
      .in('tour_id', ids);
    tourMemberIds = (tourMembers || []).map(m => m.user_id);
  }

  const memberIds = [
    community.admin_id,
    ...(community.co_admin_ids || []),
    ...(members || []).map(m => m.user_id),
    ...tourMemberIds,
  ].filter(Boolean);
  const uniqueIds = [...new Set(memberIds)];

  const uncached = uniqueIds.filter(id => !state.profileCache[id]);
  if (uncached.length) {
    const { data: profs } = await sb.from('profiles').select('id,username').in('id', uncached);
    (profs || []).forEach(p => { state.profileCache[p.id] = p.username; });
  }

  state.communityMembers = uniqueIds.map(id => ({
    id,
    username:  state.profileCache[id] || id,
    isAdmin:   community.admin_id === id,
    isCoAdmin: (community.co_admin_ids || []).includes(id),
  }));
  state._loadedCommunityDataId = communityId;
}

async function updateCommunity(updates) {
  const { error } = await sb
    .from('communities')
    .update(updates)
    .eq('id', state.currentCommunityId);
  if (error) throw new Error(error.message);
  Object.assign(state.currentCommunity, updates);
  const idx = state.communities.findIndex(c => c.id === state.currentCommunityId);
  if (idx >= 0) Object.assign(state.communities[idx], updates);
}

async function promoteCommunityAdmin(userId) {
  const c = state.currentCommunity;
  const newCoAdmins = [...new Set([...(c.co_admin_ids || []), userId])];
  await updateCommunity({ co_admin_ids: newCoAdmins });
  await logChange('Co-Admin Community hinzugefügt', '', state.profileCache[userId] || userId);
}

async function demoteCommunityAdmin(userId) {
  const c = state.currentCommunity;
  const newCoAdmins = (c.co_admin_ids || []).filter(id => id !== userId);
  await updateCommunity({ co_admin_ids: newCoAdmins });
  await logChange('Co-Admin Community entfernt', state.profileCache[userId] || userId, '');
}

async function removeCommunityMember(userId) {
  const { error } = await sb
    .from('community_members')
    .delete()
    .eq('community_id', state.currentCommunityId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  const username = state.profileCache[userId] || userId;
  await logCommunityChange('Mitglied entfernt', username, '');
}

async function createCommunity(name, password) {
  const { data, error } = await sb
    .from('communities')
    .insert({ name, password, admin_id: state.currentUser.id })
    .select()
    .single();
  if (error) throw new Error(error.message);

  // Auto-join as admin
  await sb.from('community_members')
    .insert({ community_id: data.id, user_id: state.currentUser.id });

  state.communities.push(data);
  state.myCommunityIds.add(data.id);
  return data;
}

/* ----------------------------------------------------------
   Planning page – polls
   ---------------------------------------------------------- */

async function loadPlanningData() {
  const cid = state.currentCommunityId;

  // Planning overview needs only tour metadata for the calendar. Route geometry
  // is loaded separately by loadPlanningMapRoutes() when the map tab is opened.
  const [
    { data: tours },
    { data: polls },
    { data: msgs },
    { data: log },
  ] = await Promise.all([
    sb.from('tours')
      .select(TOUR_LIST_SELECT)
      .eq('community_id', cid)
      .order('date', { ascending: true }),
    sb.from('community_polls')
      .select('*')
      .eq('community_id', cid)
      .order('created_at', { ascending: false }),
    sb.from('community_messages')
      .select('*')
      .eq('community_id', cid)
      .order('created_at', { ascending: true }),
    sb.from('community_changelog')
      .select('*')
      .eq('community_id', cid)
      .order('created_at', { ascending: false }),
  ]);

  state.tours = _preserveCachedRoutes(tours || []);
  state._loadedPlanningForCid = cid;

  state.communityMessages  = msgs || [];
  state.communityChangelog = log  || [];

  state.communityPolls = (polls || []).map(p => ({
    ...p,
    options: typeof p.options === 'string' ? JSON.parse(p.options) : p.options,
    votes: [],
  }));

  // Load votes — needs poll IDs from above
  const pollIds = state.communityPolls.map(p => p.id);
  if (pollIds.length) {
    const { data: votes } = await sb
      .from('community_poll_votes')
      .select('*')
      .in('poll_id', pollIds);

    (votes || []).forEach(v => {
      const poll = state.communityPolls.find(p => p.id === v.poll_id);
      if (poll) poll.votes.push({
        ...v,
        option_ids: typeof v.option_ids === 'string' ? JSON.parse(v.option_ids) : v.option_ids,
      });
    });
  }

  if (state._loadedPlanMapRoutesCid !== cid) state.communityToursGpx = [];
}

async function loadPlanningMapRoutes() {
  const cid = state.currentCommunityId;
  if (!cid) return;
  if (!navigator.onLine && state._loadedPlanMapRoutesCid === cid && state.communityToursGpx) return;
  if (state._loadedPlanMapRoutesCid === cid && state.communityToursGpx?.length) return;

  const { data } = await sb.from('tours')
    .select('id, name, route_metadata, date, end_date')
    .eq('community_id', cid)
    .not('route_metadata', 'is', null)
    .order('date', { ascending: true });

  state.communityToursGpx = _preserveCachedRoutes(data || []);
  state._loadedPlanMapRoutesCid = cid;
  state.communityToursGpx.forEach(t => {
    if (state.planMapVisible[t.id] === undefined) state.planMapVisible[t.id] = true;
  });
}

async function loadTourRouteGeometry(tourId) {
  if (!tourId) return null;
  const { data } = await sb.from('tours')
    .select('id, gpx_route, route_metadata, surface_analysis, surface_display')
    .eq('id', tourId)
    .single();
  if (!data) return null;

  const mergeRouteFields = t => t?.id === tourId ? { ...t, ...data } : t;
  state.tours = (state.tours || []).map(mergeRouteFields);
  state.communityToursGpx = (state.communityToursGpx || []).map(mergeRouteFields);
  if (state.currentTour?.id === tourId) Object.assign(state.currentTour, data);
  return data;
}

async function ensureCurrentTourRouteLoaded() {
  const tourId = state.currentTourId;
  if (!tourId) return null;
  if (state.currentTour?.gpx_route) return state.currentTour.gpx_route;

  const isStale = state._staleGpxTourIds?.has(tourId);

  // 1. IndexedDB-Cache prüfen (überlebt Reload, Multi-Tour-Sessions, Tabwechsel)
  //    Wird übersprungen wenn der GPX als stale markiert ist — dann muss frisch.
  if (!isStale && typeof gpxCacheGet === 'function') {
    try {
      const cached = await gpxCacheGet(tourId, state.currentTour?.route_metadata);
      if (cached) {
        if (state.currentTour?.id === tourId) state.currentTour.gpx_route = cached;
        return cached;
      }
    } catch (e) { /* fallback to network */ }
  }

  // 2. Wenn stale: SW-Cache für tours zuerst leeren, damit der Fetch wirklich
  //    vom Netzwerk kommt und nicht eine alte Antwort liefert.
  if (isStale && typeof _invalidateSWTable === 'function') {
    await _invalidateSWTable('tours');
    state._staleGpxTourIds.delete(tourId);
    if (typeof gpxCacheDelete === 'function') await gpxCacheDelete(tourId);
  }

  // 3. Netzwerk-Fetch
  const data = await loadTourRouteGeometry(tourId);
  const gpx  = data?.gpx_route || null;

  // 4. In IndexedDB ablegen für die nächste Session
  if (gpx && typeof gpxCachePut === 'function') {
    try { await gpxCachePut(tourId, gpx, data?.route_metadata || state.currentTour?.route_metadata); }
    catch (e) { /* non-fatal */ }
  }
  return gpx;
}

/**
 * Write an entry to the community changelog.
 */
async function logCommunityChange(field, oldValue, newValue) {
  if (!state.currentCommunityId || !state.currentUser) return;
  const entry = {
    id:           crypto.randomUUID?.() || String(Date.now()),
    community_id: state.currentCommunityId,
    user_id:      state.currentUser.id,
    username:     state.currentUser.username,
    field,
    old_value:    oldValue || '',
    new_value:    newValue || '',
    created_at:   new Date().toISOString(),
  };
  // Insert to DB
  const { data } = await sb.from('community_changelog').insert({
    community_id: entry.community_id,
    user_id:      entry.user_id,
    username:     entry.username,
    field,
    old_value:    entry.old_value,
    new_value:    entry.new_value,
  }).select().single();

  // Update local state so Log tab shows immediately without reload
  if (data) entry.id = data.id;
  state.communityChangelog = [entry, ...(state.communityChangelog || [])];
}

async function createPoll(question, options, multi, pollType = 'general', pollYear = null) {
  const { data, error } = await sb
    .from('community_polls')
    .insert({
      community_id: state.currentCommunityId,
      user_id:      state.currentUser.id,
      username:     state.currentUser.username,
      question,
      options,
      multi,
      poll_type:    pollType,
      poll_year:    pollYear,
    })
    .select().single();
  if (error) throw new Error(error.message);
  state.communityPolls.unshift({ ...data, options, votes: [], poll_type: pollType, poll_year: pollYear });
  await logCommunityChange(
    pollType === 'yearly' ? `Jahresplanung ${pollYear}` : 'Neue Abfrage',
    '',
    question + ' (' + options.map(o => o.text).join(', ') + ')'
  );
  // Push an Community-Mitglieder
  getCommunityMemberIds().then(ids =>
    sendPushToUsers(ids,
      pollType === 'yearly' ? `📅 Jahresplanung ${pollYear}` : '📊 Neue Abfrage',
      question, '/')
  );
}

async function votePoll(pollId, optionIds) {
  // Use upsert to avoid 409 conflicts on unique(poll_id, user_id)
  const { data, error } = await sb
    .from('community_poll_votes')
    .upsert({
      poll_id:    pollId,
      user_id:    state.currentUser.id,
      username:   state.currentUser.username,
      option_ids: optionIds,
    }, { onConflict: 'poll_id,user_id' })
    .select().single();

  if (error) throw new Error(error.message);

  // Update local state
  const poll = state.communityPolls.find(p => p.id === pollId);
  if (poll) {
    const idx = poll.votes.findIndex(v => v.user_id === state.currentUser.id);
    if (idx >= 0) poll.votes[idx].option_ids = optionIds;
    else poll.votes.push({ ...data, option_ids: optionIds });

    if (optionIds.length > 0) {
      const votedTexts = poll.options
        .filter(o => optionIds.includes(o.id))
        .map(o => o.text).join(', ');
      await logCommunityChange('Abstimmung', poll.question, votedTexts);
    }
  }
}

async function closePoll(pollId) {
  const { error } = await sb
    .from('community_polls')
    .update({ closed: true })
    .eq('id', pollId);
  if (error) throw new Error(error.message);
  const p = state.communityPolls.find(p => p.id === pollId);
  if (p) {
    p.closed = true;
    await logCommunityChange('Abfrage geschlossen', p.question, 'Abgeschlossen');
  }
}

async function deletePoll(pollId) {
  const { error } = await sb
    .from('community_polls')
    .delete()
    .eq('id', pollId);
  if (error) throw new Error(error.message);
  state.communityPolls = state.communityPolls.filter(p => p.id !== pollId);
}

async function sendCommunityMessage(text) {
  const { data, error } = await sb
    .from('community_messages')
    .insert({
      community_id: state.currentCommunityId,
      user_id:      state.currentUser.id,
      username:     state.currentUser.username,
      text,
    })
    .select().single();
  if (error) throw new Error(error.message);
  state.communityMessages.push(data);
  // Push an Community-Mitglieder (fire & forget)
  getCommunityMemberIds().then(ids =>
    sendPushToUsers(ids, `💬 ${state.currentUser.username}`,
      text.length > 80 ? text.slice(0, 80) + '…' : text, '/')
  );
  return data;
}

async function updatePoll(pollId, question, options, multi) {
  const { error } = await sb
    .from('community_polls')
    .update({ question, options, multi })
    .eq('id', pollId);
  if (error) throw new Error(error.message);
  const p = state.communityPolls.find(p => p.id === pollId);
  if (p) { p.question = question; p.options = options; p.multi = multi; }
  await logCommunityChange('Abfrage geändert', '', question);
}

/**
 * Compute unread badge counts for the planning button.
 * Uses localStorage timestamps keyed by community ID.
 */
async function computePlanningBadges() {
  const cid = state.currentCommunityId;
  if (!cid) return;
  // HEAD requests can't be cached → skip when offline, keep last known counts
  if (!navigator.onLine) return;
  await loadSeenStates([cid]);

  const seenChat  = getLastSeen(cid, 'plan-chat');
  const seenPolls = getLastSeen(cid, 'plan-polls');

  const [msgsRes, pollsRes] = await Promise.all([
    sb.from('community_messages')
      .select('id', { count: 'exact', head: true })
      .eq('community_id', cid)
      .neq('user_id', state.currentUser.id)
      .gt('created_at', seenChat.toISOString()),
    sb.from('community_polls')
      .select('id', { count: 'exact', head: true })
      .eq('community_id', cid)
      .gt('created_at', seenPolls.toISOString()),
  ]);

  state.planningBadges = {
    chat:  msgsRes.count  || 0,
    polls: pollsRes.count || 0,
  };
}

/* ----------------------------------------------------------
   Tour Media (Cloudinary + YouTube)
   ---------------------------------------------------------- */

async function loadTourMedia() {
  const { data } = await sb
    .from('tour_media')
    .select('*')
    .eq('tour_id', state.currentTourId)
    .order('created_at', { ascending: false });
  state.tourMedia = data || [];
}

async function uploadToCloudinary(file, progressCb) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', CLOUDINARY_PRESET);
  fd.append('folder', `motoroute/${state.currentTourId}`);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', CLOUDINARY_URL);
    xhr.upload.onprogress = e => {
      if (e.lengthComputable && progressCb) progressCb(Math.round(e.loaded / e.total * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
      else reject(new Error('Upload fehlgeschlagen: ' + xhr.status));
    };
    xhr.onerror = () => reject(new Error('Netzwerkfehler beim Upload'));
    xhr.send(fd);
  });
}

async function saveTourMedia(entry) {
  const { data, error } = await sb
    .from('tour_media')
    .insert(entry)
    .select().single();
  if (error) throw new Error(error.message);
  state.tourMedia = [data, ...state.tourMedia];
  // Log to tour changelog
  const typeLabel = entry.media_type === 'youtube' ? 'YouTube-Video' : entry.media_type === 'video' ? 'Video' : 'Bild';
  await logChange('Media', '', `${typeLabel} hinzugefügt${entry.caption ? ': ' + entry.caption : ''}`);
  // Push an Tour-Mitglieder
  getTourMemberIdsIncludingAdmin().then(ids =>
    sendPushToUsers(ids, `📸 Neue Medien`,
      `${state.currentUser.username} hat ${typeLabel} hinzugefügt${entry.caption ? ': ' + entry.caption : ''}`, '/')
  );
  return data;
}

async function deleteTourMedia(mediaId) {
  const m = state.tourMedia.find(m => m.id === mediaId);
  const { error } = await sb
    .from('tour_media')
    .delete()
    .eq('id', mediaId);
  if (error) throw new Error(error.message);
  state.tourMedia = state.tourMedia.filter(m => m.id !== mediaId);
  if (m) await logChange('Media', m.media_type === 'youtube' ? 'YouTube-Video' : m.media_type, 'Gelöscht');
}

function parseYouTubeUrl(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

async function togglePinMedia(mediaId, pinned) {
  const { error } = await sb
    .from('tour_media')
    .update({ pinned })
    .eq('id', mediaId);
  if (error) throw new Error(error.message);
  const m = state.tourMedia.find(m => m.id === mediaId);
  if (m) m.pinned = pinned;
}

async function reorderTourMedia(orderedIds) {
  // Update sort_order for each media item
  const updates = orderedIds.map((id, i) =>
    sb.from('tour_media').update({ sort_order: i }).eq('id', id)
  );
  await Promise.all(updates);
  // Update local state
  orderedIds.forEach((id, i) => {
    const m = state.tourMedia.find(m => m.id === id);
    if (m) m.sort_order = i;
  });
}

/* ----------------------------------------------------------
   Community Media
   ---------------------------------------------------------- */

async function loadCommunityMedia() {
  const cid = state.currentCommunityId;

  // Offline + Media bereits für diese Community geladen → State behalten
  if (!navigator.onLine && state._loadedMediaForCid === cid && state.communityMedia) {
    return;
  }

  const { data } = await sb
    .from('community_media')
    .select('*')
    .eq('community_id', cid)
    .order('sort_order', { ascending: true });
  state.communityMedia = data || [];
  state._loadedMediaForCid = cid;
}

async function saveCommunityMedia(entry) {
  const { data, error } = await sb
    .from('community_media')
    .insert(entry)
    .select().single();
  if (error) throw new Error(error.message);
  state.communityMedia.push(data);
  return data;
}

async function deleteCommunityMedia(mediaId) {
  const { error } = await sb
    .from('community_media')
    .delete()
    .eq('id', mediaId);
  if (error) throw new Error(error.message);
  state.communityMedia = state.communityMedia.filter(m => m.id !== mediaId);
}

async function togglePinCommunityMedia(mediaId, pinned) {
  const { error } = await sb
    .from('community_media')
    .update({ pinned })
    .eq('id', mediaId);
  if (error) throw new Error(error.message);
  const m = state.communityMedia.find(m => m.id === mediaId);
  if (m) m.pinned = pinned;
}

async function reorderCommunityMedia(orderedIds) {
  const updates = orderedIds.map((id, i) =>
    sb.from('community_media').update({ sort_order: i }).eq('id', id)
  );
  await Promise.all(updates);
  orderedIds.forEach((id, i) => {
    const m = state.communityMedia.find(m => m.id === id);
    if (m) m.sort_order = i;
  });
}

async function loadTourMediaForCommunity(tourId) {
  const { data } = await sb
    .from('tour_media')
    .select('*')
    .eq('tour_id', tourId)
    .order('created_at', { ascending: false });
  return (data || []).sort((a, b) =>
    (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) ||
    (a.sort_order || 0) - (b.sort_order || 0) ||
    new Date(b.created_at) - new Date(a.created_at)
  );
}

/* Media badges */
async function computeMediaBadges() {
  const cid = state.currentCommunityId;
  if (!cid) return;
  // HEAD requests can't be cached → skip when offline, keep last known counts
  if (!navigator.onLine) return;
  await loadSeenStates([cid]);
  const seenCm = getLastSeen(cid, 'community-media');
  const seenTm = getLastSeen(cid, 'tour-media');

  const [cmRes, tmRes] = await Promise.all([
    sb.from('community_media')
      .select('id', { count: 'exact', head: true })
      .eq('community_id', cid)
      .gt('created_at', seenCm.toISOString()),
    sb.from('tour_media')
      .select('id, tour_id', { count: 'exact', head: true })
      .in('tour_id', (state.tours || []).map(t => t.id))
      .gt('created_at', seenTm.toISOString()),
  ]);

  state.mediaBadges = {
    community: cmRes.count || 0,
    tours:     tmRes.count || 0,
  };
}

async function computeTourMediaCounts() {
  const tourIds = (state.tours || []).map(t => t.id);
  if (!tourIds.length) { state.tourMediaCounts = {}; state.tourMediaNew = {}; return; }

  // Offline → bestehende Counts behalten (HEAD-ähnliche Queries cachen schlecht)
  if (!navigator.onLine && state._loadedTourMediaCountsCid === state.currentCommunityId) {
    return;
  }
  await loadSeenStates([state.currentCommunityId]);

  const seenMedia = getLastSeen(state.currentCommunityId, 'tour-media');

  const [allRes, newRes] = await Promise.all([
    sb.from('tour_media').select('tour_id').in('tour_id', tourIds),
    sb.from('tour_media').select('tour_id')
      .in('tour_id', tourIds)
      .neq('user_id', state.currentUser.id)
      .gt('created_at', seenMedia.toISOString()),
  ]);

  // Total counts
  state.tourMediaCounts = {};
  (allRes.data || []).forEach(m => {
    state.tourMediaCounts[m.tour_id] = (state.tourMediaCounts[m.tour_id] || 0) + 1;
  });

  // New (unseen) counts
  state.tourMediaNew = {};
  (newRes.data || []).forEach(m => {
    state.tourMediaNew[m.tour_id] = (state.tourMediaNew[m.tour_id] || 0) + 1;
  });
  state._loadedTourMediaCountsCid = state.currentCommunityId;
}

/* ----------------------------------------------------------
   Site Admin & Community Approval
   ---------------------------------------------------------- */

async function isSiteAdmin() {
  const { data } = await sb
    .from('site_admins')
    .select('user_id')
    .eq('user_id', state.currentUser.id)
    .maybeSingle();
  return !!data;
}

async function submitCommunityRequest(name, password) {
  const { error } = await sb
    .from('community_requests')
    .insert({
      name,
      password,
      requested_by: state.currentUser.id,
      username: state.currentUser.username,
    });
  if (error) throw new Error(error.message);
}

async function loadCommunityRequests() {
  const { data } = await sb
    .from('community_requests')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  return data || [];
}

async function approveCommunityRequest(requestId) {
  // Get the request
  const { data: req } = await sb
    .from('community_requests')
    .select('*')
    .eq('id', requestId)
    .single();
  if (!req) throw new Error('Request nicht gefunden');

  // Create the community
  const { data: community, error: cErr } = await sb
    .from('communities')
    .insert({
      name: req.name,
      password: req.password,
      admin_id: req.requested_by,
      approved: true,
    })
    .select().single();
  if (cErr) throw new Error(cErr.message);

  // Add requester as member
  await sb.from('community_members').insert({
    community_id: community.id,
    user_id: req.requested_by,
  });

  // Update request status
  await sb.from('community_requests')
    .update({ status: 'approved' })
    .eq('id', requestId);

  return community;
}

async function rejectCommunityRequest(requestId) {
  await sb.from('community_requests')
    .update({ status: 'rejected' })
    .eq('id', requestId);
}

async function loadSiteAdmins() {
  const { data } = await sb
    .from('site_admins')
    .select('user_id');
  if (!data) return [];
  // Resolve usernames
  const ids = data.map(d => d.user_id);
  const { data: profiles } = await sb
    .from('profiles')
    .select('id, username')
    .in('id', ids);
  return (profiles || []).map(p => ({ user_id: p.id, username: p.username }));
}

async function addSiteAdmin(username) {
  const { data: profile } = await sb
    .from('profiles')
    .select('id, username')
    .eq('username', username)
    .maybeSingle();
  if (!profile) throw new Error(`User "${username}" nicht gefunden`);

  const { error } = await sb
    .from('site_admins')
    .insert({ user_id: profile.id });
  if (error) {
    if (error.code === '23505') throw new Error(`${username} ist bereits Seitenadmin`);
    throw new Error(error.message);
  }
  return profile;
}

async function removeSiteAdmin(userId) {
  if (userId === state.currentUser.id) throw new Error('Du kannst dich nicht selbst entfernen');
  const { error } = await sb
    .from('site_admins')
    .delete()
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

async function loadAllUsers() {
  const { data } = await sb
    .from('profiles')
    .select('id, username')
    .order('username', { ascending: true });
  return data || [];
}

/**
 * Permanently delete a user account (site admin only).
 * Calls the delete-user Edge Function with the current user's JWT.
 */
async function deleteUserAccount(userId) {
  const { data: { session } } = await sb.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Nicht eingeloggt');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-user`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ user_id: userId }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
}

/**
 * Request a self-service password reset email for the given username.
 * Always returns success to prevent user enumeration.
 * @param {string} username
 * @returns {Promise<{ok:boolean, has_email?:boolean}>}
 */
async function requestPasswordReset(username, overrideEmail = '') {
  const headers = { 'Content-Type': 'application/json' };

  // If an override email is supplied (admin flow), attach the JWT for server-side auth check
  if (overrideEmail) {
    const { data: { session } } = await sb.auth.getSession();
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  const body = { username };
  if (overrideEmail) body.override_email = overrideEmail;

  const res = await fetch(`${SUPABASE_URL}/functions/v1/request-password-reset`, {
    method:  'POST',
    headers,
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

/**
 * Complete a password reset with a token from the email link.
 * @param {string} token
 * @param {string} newPassword
 */
async function completePasswordReset(token, newPassword) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/complete-password-reset`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, new_password: newPassword }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
}


/* ----------------------------------------------------------
   Push Notifications
   ---------------------------------------------------------- */

const PUSH_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/send-push`;

/**
 * Holt alle User-IDs einer Community (außer dem aktuellen User).
 */
async function getCommunityMemberIds(communityId) {
  const { data } = await sb
    .from('community_members')
    .select('user_id')
    .eq('community_id', communityId || state.currentCommunityId);
  return (data || [])
    .map(m => m.user_id)
    .filter(id => id !== state.currentUser?.id);
}

/**
 * Holt alle User-IDs einer Tour (außer dem aktuellen User).
 */
async function getTourMemberIds(tourId) {
  const { data } = await sb
    .from('tour_members')
    .select('user_id')
    .eq('tour_id', tourId || state.currentTourId);
  return (data || [])
    .map(m => m.user_id)
    .filter(id => id !== state.currentUser?.id);
}

/**
 * Holt alle User-IDs einer Tour inkl. Admin (außer dem aktuellen User).
 */
async function getTourMemberIdsIncludingAdmin(tourId) {
  const tid = tourId || state.currentTourId;
  const { data } = await sb
    .from('tour_members')
    .select('user_id')
    .eq('tour_id', tid);
  const memberIds = (data || []).map(m => m.user_id);
  // Admin auch einschließen falls nicht in tour_members
  const adminId = state.currentTour?.admin_id;
  const allIds = adminId ? [...new Set([...memberIds, adminId])] : memberIds;
  return allIds.filter(id => id !== state.currentUser?.id);
}

/**
 * Sendet Push-Benachrichtigungen an eine Liste von User-IDs.
 * Läuft fire-and-forget – Fehler werden nur geloggt, nicht geworfen.
 */
async function sendPushToUsers(userIds, title, body, url = '/') {
  if (!userIds?.length) return;
  try {
    await fetch(PUSH_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON}`,
      },
      body: JSON.stringify({ user_ids: userIds, title, body, url }),
    });
  } catch (e) {
    console.warn('[Push] Fehler:', e.message);
  }
}

/* ============================================================
   Site Content (Info / Changelog) — editable by site_admins
   ============================================================ */

async function loadSiteContent() {
  const { data, error } = await sb
    .from('site_content')
    .select('key,content,updated_at,updated_by');
  if (error) {
    console.warn('[site_content] load failed:', error.message);
    return {};
  }
  const map = {};
  for (const row of data || []) map[row.key] = row;
  return map;
}

async function saveSiteContent(key, content) {
  const { error } = await sb
    .from('site_content')
    .upsert({
      key,
      content,
      updated_at: new Date().toISOString(),
      updated_by: state.currentUser.id,
    });
  if (error) throw new Error('Speichern fehlgeschlagen: ' + error.message);
}

/* ============================================================
   Tour Check-ins
   ============================================================ */

/**
 * Fire-and-forget call to the notify-tour-event Edge Function.
 * Sends push + email to all other tour members.
 */
async function _notifyTourEvent({ tour_id, event_type, actor_user_id, actor_username, details }) {
  await fetch(
    `${SUPABASE_URL}/functions/v1/notify-tour-event`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON },
      body: JSON.stringify({ tour_id, event_type, actor_user_id, actor_username, details }),
    }
  );
}

/**
 * Load all check-ins for a tour. Returns a Set of user_ids who confirmed.
 */
async function loadTourCheckins(tourId) {
  const { data, error } = await sb
    .from('tour_checkins')
    .select('user_id')
    .eq('tour_id', tourId);
  if (error) { console.warn('[loadTourCheckins]', error.message); return new Set(); }
  return new Set((data || []).map(r => r.user_id));
}

/**
 * Toggle the current user's check-in for a tour.
 * Returns the new confirmed state (true = confirmed, false = removed).
 */
async function toggleCheckin(tourId) {
  const userId = state.currentUser?.id;
  if (!userId) throw new Error('Nicht eingeloggt');

  const already = state.tourCheckins?.[tourId]?.has(userId);

  if (already) {
    const { error } = await sb
      .from('tour_checkins')
      .delete()
      .eq('tour_id', tourId)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
    state.tourCheckins[tourId].delete(userId);
    return false;
  } else {
    const { error } = await sb
      .from('tour_checkins')
      .insert({ tour_id: tourId, user_id: userId });
    if (error) throw new Error(error.message);
    if (!state.tourCheckins) state.tourCheckins = {};
    if (!state.tourCheckins[tourId]) state.tourCheckins[tourId] = new Set();
    state.tourCheckins[tourId].add(userId);

    // Fire-and-forget: notify other tour members
    _notifyTourEvent({
      tour_id:        tourId,
      event_type:     'checkin',
      actor_user_id:  userId,
      actor_username: state.currentUser.username || state.profileCache[userId] || 'Unbekannt',
    }).catch(e => console.warn('[notify checkin]', e));

    return true;
  }
}
