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

let _heartbeatTimer = null;

/**
 * Start sending a "last_seen_at" heartbeat to Supabase every 2 minutes.
 * Called after successful login.
 */
function startHeartbeat() {
  stopHeartbeat();
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

async function navigateTo(view, params = {}) {
  // Tear down map when leaving the tour detail page
  if (mapInstance && view !== 'tour') destroyMap();

  // Tear down realtime when leaving a tour
  if (view !== 'tour') unsubscribeFromChat();

  // Merge any extra params into global state
  Object.assign(state, params);

  // Load data required for the target view
  try {
    if (view === 'home' && state.currentUser) await loadHomeData();
    if (view === 'tour' && state.currentTourId) {
      await loadTourData(state.currentTourId);
      subscribeToChat(state.currentTourId);
    }
  } catch (e) {
    console.error('[navigateTo] data fetch error:', e);
  }

  state.view = view;
  render();
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

  // Navigation bar is shown on every view except auth / loading
  const showNav = !['auth', 'loading'].includes(state.view);

  let html = showNav ? renderNav() : '';

  if (state.view === 'profile') {
    app.innerHTML = html + '<div class="loading-screen" style="font-size:20px">Lade…</div>';
    renderProfile().then(profileHtml => {
      app.innerHTML = html + profileHtml;
      attachEvents();
    });
    return;
  }

  switch (state.view) {
    case 'auth':   html += renderAuth();   break;
    case 'home':   html += renderHome();   break;
    case 'create': html += renderCreate(); break;
    case 'join':   html += renderJoin();   break;
    case 'tour':   html += renderTour();   break;
    default:       html += '<div class="loading-screen">…</div>';
  }

  app.innerHTML = html;
  attachEvents();
}

/* ----------------------------------------------------------
   Boot
   ---------------------------------------------------------- */

/**
 * Application entry point.
 * Checks for an existing Supabase session and routes accordingly.
 */
async function init() {
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
          await navigateTo('home');
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

// Start the application
init();
