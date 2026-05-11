/* ============================================================
   state.js – Global application state
   ============================================================ */

const state = {
  /* Routing */
  view:          'loading',   // 'auth'|'communities'|'community-home'|'community-settings'|'create'|'tour'|'profile'
  authMode:      'login',
  authErr:       '',

  /* Session */
  currentUser:   null,        // { id: uuid, username: string }

  /* Communities landing */
  communities:       [],
  myCommunityIds:    new Set(),
  communityMemberCounts: {},

  /* Active community */
  currentCommunityId: null,
  currentCommunity:   null,
  communityMembers:   [],

  /* Planning page */
  planningTab:      'polls',   // 'polls'|'map'|'chat'|'log'
  communityPolls:   [],
  communityMessages: [],
  communityChangelog: [],
  planMapVisible:   {},        // tourId -> boolean (visible on plan map)
  planCalYear:      null,       // year shown in planning calendar
  planningBadges:   { chat: 0, polls: 0 },

  /* Community home (tours) */
  tourFilter:    'all',   // 'all' | 'upcoming' | 'past'
  tours:         [],
  myTourIds:     new Set(),
  profileCache:  {},
  memberCounts:  {},
  tourMemberIds: {},
  homeBadges:    {},
  seenState:     {},
  calMonth:      null,       // home calendar current month
  calView:       'month',    // 'month' | 'year' — home calendar
  planCalView:   'year',     // 'month' | 'year' — planning calendar
  planCalMonth:  null,       // Date for planning month view nav

  /* Active tour */
  currentTourId: null,
  currentTab:    'overview',
  currentTour:   null,
  tourMembers:   [],
  tourMessages:  [],
  tourPlanDates: [],
  tourChangelog: [],
  tourMedia:     [],
  mediaUploading: false,
  communityMedia: [],
  selectedTourMedia: null,
  mediaBadges:    { community: 0, tours: 0 },
  tourMediaCounts: {},
  tourMediaNew:    {},
  isSiteAdminUser: false,   // tour id selected in community media view
  tabBadges:     {},
  tourCalMonth:  null,
  pendingPlanDate: null,
  editingPlanDateId: null,

  /* Check-ins: tourId → Set of user_ids who confirmed */
  tourCheckins:  {},

  /* Misc */
  preJoinId:     null,
};

/* ----------------------------------------------------------
   State Persistence (localStorage)
   Allows the app to survive a cold restart (mobile OS killing
   the PWA process in the background) and continue working
   offline with previously cached data.
   ---------------------------------------------------------- */
const STATE_STORAGE_KEY = 'motoroute_state_v1';
const STATE_SCHEMA_VERSION = 7;
const STATE_APP_VERSION = (typeof APP_VERSION !== 'undefined' && APP_VERSION) ? APP_VERSION : 'dev';
const STATE_MAX_AGE_MS  = 7 * 24 * 60 * 60 * 1000; // 7 days

function persistState() {
  if (!state.currentUser) return;
  try {
    // Convert Sets and other non-serializable values to plain types
    const snap = {
      schemaVersion: STATE_SCHEMA_VERSION,
      appVersion: STATE_APP_VERSION,
      ts: Date.now(),
      currentUser:        state.currentUser,
      currentCommunityId: state.currentCommunityId,
      currentCommunity:   state.currentCommunity,
      currentTourId:      state.currentTourId,
      // gpx_route lebt in IndexedDB (siehe gpx-cache.js) — beim Persistieren
      // hier rausstrippen damit das 5-MB-Limit von localStorage nicht
      // gesprengt wird (volle GPX = bis zu 800 KB pro Tour).
      currentTour:        state.currentTour ? { ...state.currentTour, gpx_route: undefined } : state.currentTour,
      communities:        state.communities,
      tours:              state.tours,
      communityMembers:   state.communityMembers,
      communityMedia:     state.communityMedia,
      communityChangelog: state.communityChangelog,
      communityPolls:     state.communityPolls,
      communityMessages:  state.communityMessages,
      // Tour-Detail-Daten persistieren, damit ein Offline-Cold-Start die
      // zuletzt geöffnete Tour vollständig anzeigen kann (Mitglieder, Chat,
      // Plan-Termine, Log, Media). Die GPX-Geometrie liegt separat in IndexedDB
      // (siehe gpx-cache.js). Wetter wird live von open-meteo geladen und ist
      // offline bewusst nicht verfügbar.
      tourMembers:        state.tourMembers,
      tourMessages:       state.tourMessages,
      tourChangelog:      state.tourChangelog,
      tourMedia:          state.tourMedia,
      tourPlanDates:      state.tourPlanDates,
      profileCache:       state.profileCache,
      memberCounts:       state.memberCounts,
      tourMemberIds:      state.tourMemberIds,
      tourMediaCounts:    state.tourMediaCounts,
      tourMediaNew:       state.tourMediaNew,
      seenState:          state.seenState,
      weatherCache:       state.weatherCache,
      myTourIds:          [...(state.myTourIds || [])],
      myCommunityIds:     [...(state.myCommunityIds || [])],
      tourCheckins:       Object.fromEntries(
        Object.entries(state.tourCheckins || {}).map(([k, v]) => [k, [...(v || [])]])
      ),
      // SWR fast-path flags
      _loadedCommunityDataId:    state._loadedCommunityDataId,
      _loadedHomeForCid:         state._loadedHomeForCid,
      _loadedPlanningForCid:     state._loadedPlanningForCid,
      _loadedMediaForCid:        state._loadedMediaForCid,
      _loadedPlanDatesTourId:    state._loadedPlanDatesTourId,
      _loadedTourMediaCountsCid: state._loadedTourMediaCountsCid,
    };
    localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(snap));
  } catch (e) {
    console.warn('[persistState]', e);
  }
}

function restoreState(expectedUserId) {
  try {
    const raw = localStorage.getItem(STATE_STORAGE_KEY);
    if (!raw) return false;
    const snap = JSON.parse(raw);
    if (!snap || !snap.ts) return false;
    if (snap.schemaVersion !== STATE_SCHEMA_VERSION) {
      localStorage.removeItem(STATE_STORAGE_KEY);
      return false;
    }
    if (STATE_APP_VERSION !== 'dev' && snap.appVersion && snap.appVersion !== STATE_APP_VERSION) {
      localStorage.removeItem(STATE_STORAGE_KEY);
      return false;
    }
    if (expectedUserId && snap.currentUser?.id !== expectedUserId) {
      localStorage.removeItem(STATE_STORAGE_KEY);
      return false;
    }
    if (Date.now() - snap.ts > STATE_MAX_AGE_MS) {
      localStorage.removeItem(STATE_STORAGE_KEY);
      return false;
    }
    // Restore fields
    Object.assign(state, snap);
    // Convert arrays back to Sets
    state.myTourIds      = new Set(snap.myTourIds      || []);
    state.myCommunityIds = new Set(snap.myCommunityIds || []);
    state.tourCheckins   = Object.fromEntries(
      Object.entries(snap.tourCheckins || {}).map(([k, v]) => [k, new Set(v || [])])
    );
    delete state.ts;
    delete state.schemaVersion;
    delete state.appVersion;
    return true;
  } catch (e) {
    console.warn('[restoreState]', e);
    return false;
  }
}

function clearPersistedState() {
  try { localStorage.removeItem(STATE_STORAGE_KEY); } catch (e) {}
}
