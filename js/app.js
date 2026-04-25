/* ============================================================
   app.js – Application router, render dispatcher and boot
   This file is loaded last and calls init() to start the app.
   Depends on: all other modules
   ============================================================ */

/* ----------------------------------------------------------
   Realtime chat subscription
   ---------------------------------------------------------- */

let realtimeChannel = null;

/**
 * Subscribe to new messages for the given tour via Supabase Realtime.
 * Automatically appends incoming messages to the chat DOM.
 * @param {string} tourId
 */
function subscribeToChat(tourId) {
  unsubscribeFromChat(); // always clean up first

  realtimeChannel = sb
    .channel(`chat:${tourId}`)
    .on(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  'messages',
        filter: `tour_id=eq.${tourId}`,
      },
      (payload) => {
        const msg = payload.new;
        // Avoid duplicates: skip messages sent by this user
        // (already added optimistically — but we removed that, so always append)
        state.tourMessages.push(msg);
        _appendChatMessage(msg);
      }
    )
    .subscribe();
}

/**
 * Remove the active Realtime subscription, if any.
 */
function unsubscribeFromChat() {
  if (realtimeChannel) {
    sb.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
}

let communityChannel = null;

function subscribeToCommunityChat(communityId) {
  unsubscribeFromCommunityChat();
  communityChannel = sb
    .channel('community-chat:' + communityId)
    .on('postgres_changes', {
      event:  'INSERT',
      schema: 'public',
      table:  'community_messages',
      filter: 'community_id=eq.' + communityId,
    }, (payload) => {
      const msg = payload.new;
      if (msg.user_id === state.currentUser?.id) return;
      state.communityMessages.push(msg);
      if (state.view === 'planning' && state.planningTab === 'chat') {
        _appendPlanChatMessage(msg);
      }
    })
    .subscribe();
}

function unsubscribeFromCommunityChat() {
  if (communityChannel) {
    sb.removeChannel(communityChannel);
    communityChannel = null;
  }
}

let _heartbeatTimer = null;

/**
 * Start sending a "last_seen_at" heartbeat to Supabase every 2 minutes.
 * Called after successful login.
 */
function startHeartbeat() {
  stopHeartbeat();

  // Load site-admin flag once on login so the global ℹ️ button
  // can show the edit option on any view.
  isSiteAdmin().then(v => { state.isSiteAdminUser = v; }).catch(() => {});

  const ping = () => {
    if (state.currentUser) {
      sb.from('profiles')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', state.currentUser.id)
        .then(() => {});
    }
  };
  ping(); // immediately on login
  _heartbeatTimer = setInterval(ping, 2 * 60 * 1000); // every 2 minutes

  // Also ping on visibility change (tab becomes active again)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) ping();
  });
}

/**
 * Stop the heartbeat (on logout).
 */
function stopHeartbeat() {
  if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
}

/**
 * Returns true if the current user is admin or co-admin of the current tour.
 */
function isCurrentUserAdmin() {
  const tour = state.currentTour;
  if (!tour) return false;
  if (tour.admin_id === state.currentUser?.id) return true;
  return (tour.co_admin_ids || []).includes(state.currentUser?.id);
}

/* ----------------------------------------------------------
   Router
   ---------------------------------------------------------- */

let _navigating = false;

async function navigateTo(view, params = {}) {
  // Guard against concurrent calls (double-click, stacked event listeners, etc.)
  if (_navigating) return;
  _navigating = true;

  try {
    // Tear down map when leaving the tour detail page
    if (mapInstance && view !== 'tour') destroyMap();

    // Tear down realtime when leaving a tour
    if (view !== 'tour') unsubscribeFromChat();

    // Unsubscribe from community chat when leaving planning page
    if (view !== 'planning') unsubscribeFromCommunityChat();

    // Destroy plan map when leaving planning page
    if (view !== 'planning' && typeof _planMapInstance !== 'undefined' && _planMapInstance) {
      try { _planMapInstance.stop(); _planMapInstance.remove(); } catch(e) {}
      _planMapInstance = null;
      _planMapLayers   = [];
    }

    // Merge any extra params into global state
    Object.assign(state, params);

    // Load data required for the target view
    try {
      if (view === 'communities' && state.currentUser) {
        await loadCommunities();
        state.isSiteAdminUser = await isSiteAdmin();
      }
      if ((view === 'community-home' || view === 'planning' || view === 'community-media') && state.currentCommunityId) {
        await loadCommunityData(state.currentCommunityId);
        if (view === 'community-home') {
          await loadHomeData();
          await computePlanningBadges();
          await computeMediaBadges();
        }
        if (view === 'community-media') {
          await loadHomeData(); // needed for tours list
          await loadCommunityMedia();
          await computeTourMediaCounts();
          state.selectedTourMedia = null;
          markTabSeen(state.currentCommunityId, 'community-media');
          markTabSeen(state.currentCommunityId, 'tour-media');
          state.mediaBadges = { community: 0, tours: 0 };
        }
        if (view === 'planning') {
          await loadPlanningData();
          markTabSeen(state.currentCommunityId, 'plan-chat');
          markTabSeen(state.currentCommunityId, 'plan-polls');
          state.planningBadges = { chat: 0, polls: 0 };
          subscribeToCommunityChat(state.currentCommunityId);
        }
      }
      if (view === 'tour' && state.currentTourId) {
        await loadTourData(state.currentTourId);
        await loadTourMedia();
        subscribeToChat(state.currentTourId);
      }
    } catch (e) {
      console.error('[navigateTo] data fetch error:', e);
    }

    state.view = view;
    render();
  } finally {
    _navigating = false;
  }
}

/* ----------------------------------------------------------
   Render dispatcher
   ---------------------------------------------------------- */

/**
 * Re-render the entire #app element based on state.view.
 * After injecting HTML, wire up event listeners.
 */
function render() {
  const app = document.getElementById('app');
  if (!app) return;

  const showNav = !['auth', 'loading'].includes(state.view);

  try {
    let html = showNav ? renderNav() : '';

    switch (state.view) {
      case 'auth':                html += renderAuth();             break;
      case 'communities':         html += renderCommunities();      break;
    case 'create-community':    html += renderCreateCommunity();  break;
      case 'community-home':      html += renderCommunityHome();    break;
    case 'planning':            html += renderPlanning();          break;
    case 'community-media':     html += renderCommunityMedia();    break;
      case 'create':              html += renderCreate();           break;
      case 'join':                html += renderJoin();             break;
      case 'tour':                html += renderTour();             break;
      default: html += '<div class="loading-screen">…</div>';
    }

    app.innerHTML = html;
    attachEvents();
    syncStickyLayout();
  } catch (e) {
    console.error('[render] error:', e);
    app.innerHTML = `<div style="padding:40px;color:#e04444;font-family:monospace">
      <strong>Render-Fehler:</strong><br>${e.message}<br><br>
      <button onclick="location.reload()" style="padding:8px 16px;cursor:pointer">Seite neu laden</button>
    </div>`;
  }
}

function syncStickyLayout() {
  requestAnimationFrame(() => {
    const nav = document.querySelector('.nav');
    const subnav = document.querySelector('.community-subnav');
    const navHeight = nav ? Math.ceil(nav.getBoundingClientRect().height) : 0;
    const subnavHeight = subnav ? Math.ceil(subnav.getBoundingClientRect().height) : 0;

    document.documentElement.style.setProperty('--nav-height', `${navHeight}px`);
    document.documentElement.style.setProperty('--community-subnav-height', `${subnavHeight}px`);
  });
}

/* ----------------------------------------------------------
   Boot
   ---------------------------------------------------------- */

/**
 * Application entry point.
 * Checks for an existing Supabase session and routes accordingly.
 */
async function init() {
  window.addEventListener('resize', syncStickyLayout);
  // Listen for auth events — handle token refresh failures gracefully
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED') return; // all good
    if (event === 'SIGNED_OUT' || (!session && event === 'INITIAL_SESSION')) return;
    // If token refresh failed (session becomes null unexpectedly), redirect to login
    if (!session && state.currentUser) {
      console.warn('[auth] Session lost — redirecting to login');
      state.currentUser = null;
      stopHeartbeat();
      toast('Sitzung abgelaufen. Bitte erneut anmelden.', 'error');
      setTimeout(() => navigateTo('auth'), 1500);
    }
  });

  // Read invite hash once, then clean the URL so it doesn't interfere
  const joinId = location.hash.startsWith('#join=') ? location.hash.slice(6) : null;
  if (joinId) {
    state.preJoinId = joinId;
    history.replaceState(null, '', location.pathname + location.search);
  }

  try {
    const { data: { session } } = await sb.auth.getSession();

    if (session) {
      const { data: profile } = await sb
        .from('profiles')
        .select('username')
        .eq('id', session.user.id)
        .single();

      if (profile) {
        state.currentUser = { id: session.user.id, username: profile.username };
        state.profileCache[session.user.id] = profile.username;
        startHeartbeat();

        if (joinId) {
          // Load tours so we know if the user is already a member
          await loadHomeData();
          if (state.myTourIds.has(joinId)) {
            await navigateTo('tour', { currentTourId: joinId, currentTab: 'map' });
          } else {
            await navigateTo('join');
          }
        } else {
          await navigateTo('communities');
        }
        return;
      }
    }
  } catch (e) {
    console.error('[init] session check failed:', e);
  }

  // No valid session → auth screen (preJoinId already saved above)
  state.authMode = 'login';
  state.view     = 'auth';
  render();
}

// Global poll edit handler — registered immediately so onclick works at any time
window._openPollEdit = function(pollId) {
  const poll = state.communityPolls.find(p => p.id === pollId);
  if (!poll) { console.warn('[_openPollEdit] Poll not found:', pollId, 'Available:', state.communityPolls.map(p=>p.id)); return; }
  document.getElementById('poll-edit-overlay')?.remove();
  document.body.insertAdjacentHTML('beforeend', renderPollEditModal(poll));
  _attachPollEditModal(poll);
};

// Start the application
init();
initPWA();
