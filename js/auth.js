/* ============================================================
   auth.js – Authentication: register, login, logout
   Depends on: config.js (sb), state.js (state), utils.js
               app.js (navigateTo, render)  [called at runtime]
   ============================================================ */

/**
 * Register a new user with username + password.
 * Supabase Auth requires an e-mail, so we derive one via usernameToEmail().
 */
async function doRegister() {
  const username = (document.getElementById('a-name')?.value || '').trim();
  const pw       = document.getElementById('a-pw')?.value  || '';
  const pw2      = document.getElementById('a-pw2')?.value || '';

  state.authErr = '';

  if (!username || username.length < 2) {
    state.authErr = 'Benutzername muss mindestens 2 Zeichen haben.'; render(); return;
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
    state.authErr = 'Nur Buchstaben, Zahlen, _, . und - erlaubt.'; render(); return;
  }
  if (!pw || pw.length < 6) {
    state.authErr = 'Passwort muss mindestens 6 Zeichen haben.'; render(); return;
  }
  if (pw !== pw2) {
    state.authErr = 'Passwörter stimmen nicht überein.'; render(); return;
  }

  setBtn('auth-btn', true);

  try {
    const email = usernameToEmail(username);
    const { data, error } = await sb.auth.signUp({ email, password: pw });

    if (error || !data.user) {
      state.authErr = error?.message?.includes('already')
        ? 'Benutzername bereits vergeben.'
        : (error?.message || 'Registrierung fehlgeschlagen.');
      render(); return;
    }

    const { error: profErr } = await sb.from('profiles').insert({ id: data.user.id, username });
    if (profErr) {
      state.authErr = 'Benutzername bereits vergeben.';
      await sb.auth.signOut();
      render(); return;
    }

    state.currentUser = { id: data.user.id, username };
    state.profileCache[data.user.id] = username;
    startHeartbeat();
    await navigateTo('communities');
  } catch (e) {
    console.error('[doRegister]', e);
    state.authErr = 'Registrierung fehlgeschlagen: ' + (e.message || e);
    render();
  }
}

/**
 * Sign in an existing user with username + password.
 */
async function doLogin() {
  const username = (document.getElementById('a-name')?.value || '').trim();
  const pw       = document.getElementById('a-pw')?.value || '';

  state.authErr = '';

  if (!username) { state.authErr = 'Benutzername eingeben.'; render(); return; }
  if (!pw)       { state.authErr = 'Passwort eingeben.';     render(); return; }

  setBtn('auth-btn', true);

  try {
    const email = usernameToEmail(username);
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pw });

    if (error) {
      state.authErr = 'Benutzername oder Passwort falsch.';
      render(); return;
    }

    const { data: profile } = await sb.from('profiles').select('username, default_community_id').eq('id', data.user.id).single();
    state.currentUser = {
      id: data.user.id,
      username: profile?.username || username,
      defaultCommunityId: profile?.default_community_id || null,
    };
    state.profileCache[data.user.id] = state.currentUser.username;
    startHeartbeat();
    if (profile?.default_community_id) {
      await navigateTo('community-home', { currentCommunityId: profile.default_community_id });
    } else {
      await navigateTo('communities');
    }
  } catch (e) {
    console.error('[doLogin]', e);
    state.authErr = 'Login fehlgeschlagen: ' + (e.message || e);
    render();
  }
}

/**
 * Sign out and return to the auth screen.
 */
async function doLogout() {
  stopHeartbeat();
  try { await sb.auth.signOut(); } catch (e) { console.error('[doLogout]', e); }

  state.currentUser         = null;
  state.tours               = [];
  state.myTourIds           = new Set();
  state.profileCache        = {};
  state.currentTour         = null;
  state.communities         = [];
  state.myCommunityIds      = new Set();
  state.currentCommunityId  = null;
  state.currentCommunity    = null;
  state.communityMembers    = [];

  if (mapInstance) { mapInstance.remove(); mapInstance = null; }

  navigateTo('auth');
}
