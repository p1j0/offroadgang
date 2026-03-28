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
  const [tourRes, membersRes, msgsRes, datesRes] = await Promise.all([
    sb.from('tours').select('*').eq('id', tourId).single(),
    sb.from('tour_members').select('user_id').eq('tour_id', tourId),
    sb.from('messages').select('*').eq('tour_id', tourId).order('created_at', { ascending: true }),
    sb.from('plan_dates').select('*').eq('tour_id', tourId).order('date', { ascending: true }),
  ]);

  state.currentTour    = tourRes.data;
  state.tourMessages   = msgsRes.data  || [];
  state.tourPlanDates  = datesRes.data || [];

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

/**
 * Update editable tour fields (destination, distance, description).
 * @param {object} updates
 */
async function updateTourInfo(updates) {
  const { error } = await sb
    .from('tours')
    .update(updates)
    .eq('id', state.currentTourId);
  if (error) throw new Error(error.message);
  if (state.currentTour) Object.assign(state.currentTour, updates);
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
}

/**
 * Delete a planning date by its UUID.
 * @param {string} id
 */
async function deletePlanDate(id) {
  await sb.from('plan_dates').delete().eq('id', id);
  state.tourPlanDates = state.tourPlanDates.filter(d => d.id !== id);
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
  if (state.currentTour) state.currentTour.gpx_route = route;
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
}
