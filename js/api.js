/* ============================================================
   api.js – All Supabase database operations
   Depends on: config.js (sb), state.js (state)
   ============================================================ */

/* ----------------------------------------------------------
   Home data
   ---------------------------------------------------------- */

/**
 * Load all tours + the current user's memberships and cache admin usernames.
 */
async function loadHomeData() {
  const [toursRes, membershipsRes] = await Promise.all([
    sb.from('tours').select('*').order('date', { ascending: true }),
    sb.from('tour_members').select('tour_id').eq('user_id', state.currentUser.id),
  ]);

  state.tours = toursRes.data || [];

  const memberIds = (membershipsRes.data || []).map(m => m.tour_id);
  const adminIds  = state.tours
    .filter(t => t.admin_id === state.currentUser.id)
    .map(t => t.id);

  state.myTourIds = new Set([...memberIds, ...adminIds]);

  // Cache admin usernames that we haven't seen yet
  const uncached = [...new Set(
    state.tours.map(t => t.admin_id).filter(id => !state.profileCache[id])
  )];
  if (uncached.length) {
    const { data: profs } = await sb.from('profiles').select('id,username').in('id', uncached);
    (profs || []).forEach(p => { state.profileCache[p.id] = p.username; });
  }
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
    sb.from('tours').select('*').eq('id', tourId).single(),
    sb.from('tour_members').select('user_id').eq('tour_id', tourId),
    sb.from('messages').select('*').eq('tour_id', tourId).order('created_at', { ascending: true }),
    sb.from('plan_dates').select('*').eq('tour_id', tourId).order('date', { ascending: true }),
    sb.from('change_log').select('*').eq('tour_id', tourId).order('created_at', { ascending: false }),
  ]);

  state.currentTour    = tourRes.data;
  state.tourMessages   = msgsRes.data      || [];
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

  // Build sorted member list: admin first, then others
  const adminId = state.currentTour?.admin_id;
  state.tourMembers = [
    ...(adminId ? [{
      user_id:  adminId,
      username: state.profileCache[adminId] || 'Admin',
      isAdmin:  true,
    }] : []),
    ...(membersRes.data || [])
      .filter(m => m.user_id !== adminId)
      .map(m => ({
        user_id:  m.user_id,
        username: state.profileCache[m.user_id] || 'Unbekannt',
        isAdmin:  false,
      })),
  ];

  if (state.currentTour?.date) {
    state.tourCalMonth = new Date(state.currentTour.date + 'T12:00:00');
  }

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
  const newLog   = state.tourChangelog.filter(e => new Date(e.created_at) > seenLog);
  if (newLog.length) {
    state.tabBadges.changelog = newLog.map(e => ({
      text: `${e.username} → ${e.field}`,
      time: new Date(e.created_at),
    }));
  }

  /* ── Info (tour data changes since last visit) ── */
  const seenInfo = getLastSeen(tourId, 'info');
  const infoLog  = state.tourChangelog.filter(e => new Date(e.created_at) > seenInfo);
  if (infoLog.length) {
    state.tabBadges.info = infoLog.map(e => ({
      text: `${e.field}: ${e.new_value || '—'}`,
      time: new Date(e.created_at),
    }));
  }
}

/**
 * Reload only the changelog for the current tour.
 */
async function loadChangelog() {
  const { data } = await sb
    .from('change_log')
    .select('*')
    .eq('tour_id', state.currentTourId)
    .order('created_at', { ascending: false });
  state.tourChangelog = data || [];
}

/**
 * Write a single changelog entry.
 * @param {string} field
 * @param {string} oldValue
 * @param {string} newValue
 */
async function logChange(field, oldValue, newValue) {
  if (String(oldValue || '') === String(newValue || '')) return;
  await sb.from('change_log').insert({
    tour_id:   state.currentTourId,
    user_id:   state.currentUser.id,
    username:  state.currentUser.username,
    field,
    old_value: String(oldValue || ''),
    new_value: String(newValue || ''),
  });
}

/**
 * Refresh only the messages for the current tour.
 */
async function loadMessages() {
  const { data } = await sb
    .from('messages')
    .select('*')
    .eq('tour_id', state.currentTourId)
    .order('created_at', { ascending: true });
  state.tourMessages = data || [];
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
    .insert({ ...data, admin_id: state.currentUser.id })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return t;
}

/**
 * Join a tour after password check.
 * @param {string} tourId
 * @param {string} password
 */
async function joinTour(tourId, password) {
  const tour = state.tours.find(t => t.id === tourId);
  if (!tour)                       throw new Error('Tour nicht gefunden.');
  if (tour.join_password !== password) throw new Error('Falsches Passwort!');

  const { error } = await sb
    .from('tour_members')
    .insert({ tour_id: tourId, user_id: state.currentUser.id });

  // Ignore "duplicate key" error – user already joined
  if (error && !error.message.includes('duplicate')) throw new Error(error.message);
  state.myTourIds.add(tourId);
}

/** Human-readable labels for changelog field names. */
const FIELD_LABELS = {
  name:        'Tour-Name',
  date:        'Startdatum',
  end_date:    'Enddatum',
  destination: 'Ziel / Region',
  description: 'Beschreibung',
  distance:    'Distanz',
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
  const logPromises = Object.entries(updates).map(([key, newVal]) => {
    const oldVal = state.currentTour?.[key];
    const label  = FIELD_LABELS[key] || key;
    return logChange(label, oldVal, newVal);
  });
  await Promise.allSettled(logPromises);

  if (state.currentTour) Object.assign(state.currentTour, updates);
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
  state.myTourIds.delete(state.currentTourId);
  state.tours = state.tours.filter(t => t.id !== state.currentTourId);
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
async function addPlanDate(date, label) {
  const { data, error } = await sb
    .from('plan_dates')
    .insert({ tour_id: state.currentTourId, date, label })
    .select()
    .single();
  if (error) throw new Error(error.message);
  state.tourPlanDates.push(data);
  const display = label ? `${date} (${label})` : date;
  await logChange('Planungstermin hinzugefügt', '', display);
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
async function saveGPX(route) {
  const { error } = await sb
    .from('tours')
    .update({ gpx_route: route })
    .eq('id', state.currentTourId);
  if (error) throw new Error(error.message);
  const hadRoute = !!state.currentTour?.gpx_route;
  if (state.currentTour) state.currentTour.gpx_route = route;
  const tracks = route?.tracks?.length || 0;
  const wpts   = route?.waypoints?.length || 0;
  await logChange('Route', hadRoute ? 'Vorherige Route' : '', `${tracks} Track(s), ${wpts} Wegpunkt(e)`);
}

/**
 * Remove the GPX route from the current tour.
 */
async function deleteGPX() {
  const { error } = await sb
    .from('tours')
    .update({ gpx_route: null })
    .eq('id', state.currentTourId);
  if (error) throw new Error(error.message);
  if (state.currentTour) state.currentTour.gpx_route = null;
  await logChange('Route', 'Route vorhanden', 'Gelöscht');
}
