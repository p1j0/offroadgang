/* ============================================================
   app.js – Application router, render dispatcher and boot
   This file is loaded last and calls init() to start the app.
   Depends on: all other modules
   ============================================================ */

/* ----------------------------------------------------------
   Router
   ---------------------------------------------------------- */

/**
 * Navigate to a new view.
 * Optionally merges extra state params (e.g. currentTourId, currentTab).
 * Destroys the Leaflet map if we're leaving the tour page.
 *
 * @param {string} view   – target view name
 * @param {object} [params] – extra state fields to merge
 */
async function navigateTo(view, params = {}) {
  // Tear down map when leaving the tour detail page
  if (mapInstance && view !== 'tour') destroyMap();

  // Merge any extra params into global state
  Object.assign(state, params);

  // Load data required for the target view
  try {
    if (view === 'home' && state.currentUser) await loadHomeData();
    if (view === 'tour' && state.currentTourId) await loadTourData(state.currentTourId);
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
