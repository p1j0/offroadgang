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
  tours:         [],
  myTourIds:     new Set(),
  profileCache:  {},
  memberCounts:  {},
  tourMemberIds: {},
  homeBadges:    {},
  calMonth:      null,       // home calendar current month

  /* Active tour */
  currentTourId: null,
  currentTab:    'map',
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

  /* Misc */
  preJoinId:     null,
};
