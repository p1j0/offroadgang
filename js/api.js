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
  const cid = state.currentCommunityId;

  // Load tours for this community
  const toursRes = await sb.from('tours').select('*')
    .eq('community_id', cid)
    .order('date', { ascending: true });

  state.tours = toursRes.data || [];
  if (!state.calMonth) state.calMonth = new Date();

  if (!state.tours.length) {
    state.myTourIds   = new Set();
    state.memberCounts = {};
    state.tourMemberIds = {};
    state.homeBadges   = {};
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

  // Build per-tour member id list AND counts in one pass
  state.memberCounts  = {};
  state.tourMemberIds = {};
  (memberCountsRes.data || []).forEach(m => {
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
}

/**
 * Compute unread chat + changelog counts for each of the user's tours.
 * Uses the same localStorage last-seen timestamps as the in-tour tab badges.
 */
async function computeHomeBadges() {
  state.homeBadges = {};
  const myTourIds = [...state.myTourIds];
  if (!myTourIds.length) return;

  // For each tour, find events newer than last-seen timestamp
  await Promise.all(myTourIds.map(async tourId => {
    const seenChat = getLastSeen(tourId, 'chat');
    const seenLog  = getLastSeen(tourId, 'changelog');

    const [msgsRes, logRes] = await Promise.all([
      sb.from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('tour_id', tourId)
        .neq('user_id', state.currentUser.id)
        .gt('created_at', seenChat.toISOString()),
      sb.from('change_log')
        .select('id', { count: 'exact', head: true })
        .eq('tour_id', tourId)
        .neq('user_id', state.currentUser.id)
        .gt('created_at', seenLog.toISOString()),
    ]);

    const chat      = msgsRes.count || 0;
    const changelog = logRes.count  || 0;
    if (chat > 0 || changelog > 0) {
      state.homeBadges[tourId] = { chat, changelog };
    }
  }));
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

  if (error && !error.message.includes('duplicate')) throw new Error(error.message);
  state.myTourIds.add(tourId);

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
  state.tourMembers = state.tourMembers.filter(m => m.id !== userId);
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
  const { data } = await sb
    .from('plan_dates')
    .select('*')
    .eq('tour_id', tourId)
    .order('date', { ascending: true });
  state.tourPlanDates = data || [];
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

  // Also log to community changelog so it appears in the Planning Log tab
  const tourName = state.currentTour?.name || 'Tour';
  await logCommunityChange(
    'Neue Route in Tour',
    '',
    `${tourName}: ${tracks} Track(s), ${wpts} Wegpunkt(e)`
  );
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
  state.myCommunityIds.delete(state.currentCommunityId);
}

async function loadCommunityData(communityId) {
  const community = state.communities.find(c => c.id === communityId) ||
    (await sb.from('communities').select('*').eq('id', communityId).single()).data;
  if (!community) throw new Error('Community nicht gefunden.');
  state.currentCommunity   = community;
  state.currentCommunityId = communityId;

  // Load direct community members
  const { data: members } = await sb
    .from('community_members')
    .select('user_id')
    .eq('community_id', communityId);

  // Also include all tour members within this community's tours
  // (handles users who joined before the community system existed)
  const { data: tourIds } = await sb
    .from('tours')
    .select('id')
    .eq('community_id', communityId);

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

  // Load all tours in community (for map tab - get gpx data + dates for KW)
  const { data: tours } = await sb
    .from('tours')
    .select('id, name, gpx_route, date, end_date')
    .eq('community_id', cid)
    .not('gpx_route', 'is', null);

  // Load polls with votes
  const { data: polls } = await sb
    .from('community_polls')
    .select('*')
    .eq('community_id', cid)
    .order('created_at', { ascending: false });

  state.communityPolls = (polls || []).map(p => ({
    ...p,
    options: typeof p.options === 'string' ? JSON.parse(p.options) : p.options,
    votes: [],
  }));

  // Load all votes for these polls
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

  // Load community messages
  const { data: msgs } = await sb
    .from('community_messages')
    .select('*')
    .eq('community_id', cid)
    .order('created_at', { ascending: true });
  state.communityMessages = msgs || [];

  // Load community changelog
  const { data: log } = await sb
    .from('community_changelog')
    .select('*')
    .eq('community_id', cid)
    .order('created_at', { ascending: false });
  state.communityChangelog = log || [];

  // Init plan map visibility (all tours visible by default)
  (tours || []).forEach(t => {
    if (state.planMapVisible[t.id] === undefined) state.planMapVisible[t.id] = true;
  });

  // Store tours with gpx for plan map
  state.communityToursGpx = tours || [];
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
  const { data } = await sb
    .from('community_media')
    .select('*')
    .eq('community_id', cid)
    .order('sort_order', { ascending: true });
  state.communityMedia = data || [];
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
async function requestPasswordReset(username) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/request-password-reset`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
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

/**
 * Reset another user's password (site admin only).
 * @param {string} userId
 * @param {string} [newPassword] - if omitted, a random one is generated
 * @returns {Promise<string>} the new password
 */
async function adminResetPassword(userId, newPassword) {
  const { data: { session } } = await sb.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Nicht eingeloggt');

  const body = { user_id: userId };
  if (newPassword) body.new_password = newPassword;

  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-reset-password`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json.password;
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
