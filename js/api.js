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
    state.homeBadges   = {};
    return;
  }

  const tourIds = state.tours.map(t => t.id);

  // Load memberships and member counts filtered to this community's tours
  const [membershipsRes, memberCountsRes] = await Promise.all([
    sb.from('tour_members').select('tour_id').eq('user_id', state.currentUser.id).in('tour_id', tourIds),
    sb.from('tour_members').select('tour_id').in('tour_id', tourIds),
  ]);

  const memberIds = (membershipsRes.data || []).map(m => m.tour_id);
  const adminIds  = state.tours
    .filter(t => t.admin_id === state.currentUser.id)
    .map(t => t.id);

  state.myTourIds = new Set([...memberIds, ...adminIds]);

  state.memberCounts = {};
  (memberCountsRes.data || []).forEach(m => {
    state.memberCounts[m.tour_id] = (state.memberCounts[m.tour_id] || 0) + 1;
  });

  // Cache admin usernames
  const uncached = [...new Set(
    state.tours.map(t => t.admin_id).filter(id => !state.profileCache[id])
  )];
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
    .order('name', { ascending: true });

  // If table doesn't exist yet, show empty list gracefully
  if (error) {
    console.warn('[loadCommunities]', error.message);
    state.communities    = [];
    state.myCommunityIds = new Set();
    return;
  }
  state.communities = data || [];

  const { data: memberships } = await sb
    .from('community_members')
    .select('community_id')
    .eq('user_id', state.currentUser.id);

  const adminOf = state.communities
    .filter(c => c.admin_id === state.currentUser.id ||
                 (c.co_admin_ids || []).includes(state.currentUser.id))
    .map(c => c.id);

  const memberOf = (memberships || []).map(m => m.community_id);
  state.myCommunityIds = new Set([...adminOf, ...memberOf]);
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
