/* ============================================================
   state.js – Global application state
   ============================================================ */

const state = {
  /* Routing */
  view:          'loading',   // 'auth' | 'home' | 'create' | 'join' | 'tour' | 'profile'
  authMode:      'login',     // 'login' | 'register'
  authErr:       '',

  /* Session */
  currentUser:   null,        // { id: uuid, username: string }

  /* Home */
  tours:         [],          // all tours fetched from DB
  myTourIds:     new Set(),   // tour IDs where user is admin or member
  profileCache:  {},          // userId -> username
  memberCounts:  {},          // tourId -> member count
  homeBadges:    {},          // tourId -> { chat: N, changelog: N }

  /* Active tour */
  currentTourId: null,
  currentTab:    'map',       // 'map' | 'chat' | 'participants' | 'info'
  currentTour:   null,
  tourMembers:   [],
  tourMessages:  [],
  tourPlanDates: [],
  tourChangelog: [],
  tabBadges:     {},   // { chat: [{text,time},...], changelog: [...], info: [...] }

  /* Calendar */
  calMonth:     new Date(),   // home calendar
  calShowAll:   false,        // show non-member tours on calendar
  tourCalMonth: new Date(),   // tour info calendar

  /* Join helper */
  preJoinId: null,
};

/* ============================================================
   Map instance variables (managed by map.js)
   ============================================================ */
let mapInstance  = null;
let gpxLayer     = null;
let startMarker  = null;
let endMarker    = null;
