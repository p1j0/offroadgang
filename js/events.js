/* ============================================================
   events.js – DOM event attachment
   Depends on: all other modules (called at runtime via globals)
   ============================================================ */

/**
 * Attach all top-level event listeners after every render() call.
 * Delegates to specialised helpers for tab-specific events.
 */
function attachEvents() {
  /* --- Auth screen --- */
  document.getElementById('auth-switch')?.addEventListener('click', () => {
    state.authMode = state.authMode === 'login' ? 'register' : 'login';
    state.authErr  = '';
    render();
  });

  const authBtn = document.getElementById('auth-btn');
  if (authBtn) {
    authBtn.addEventListener('click', () => {
      state.authMode === 'login' ? doLogin() : doRegister();
    });
    document.getElementById('a-pw')?.addEventListener('keydown',  e => { if (e.key === 'Enter') authBtn.click(); });
    document.getElementById('a-pw2')?.addEventListener('keydown', e => { if (e.key === 'Enter') authBtn.click(); });
    setTimeout(() => document.getElementById('a-name')?.focus(), 50);
  }

  /* --- Navigation bar --- */
  document.getElementById('nav-logo')?.addEventListener('click', () => navigateTo('community-home'));
  document.getElementById('go-profile')?.addEventListener('click', () => navigateTo('profile'));
  document.getElementById('logout-btn')?.addEventListener('click', doLogout);

  /* --- Profile save --- */
  document.getElementById('profile-save')?.addEventListener('click', async () => {
    const email   = (document.getElementById('p-email')?.value || '').trim();
    const chat    = document.getElementById('p-notify-chat')?.checked    ?? true;
    const changes = document.getElementById('p-notify-changes')?.checked ?? true;
    setBtn('profile-save', true, '');
    try {
      await saveProfile({ notification_email: email, notify_chat: chat, notify_changes: changes });
      toast('✓ Einstellungen gespeichert');
    } catch(e) { toast(e.message, 'error'); }
    setBtn('profile-save', false, 'Einstellungen speichern');
  });

  /* --- Generic "back" buttons --- */
  document.querySelectorAll('#back-home').forEach(el => {
    el.addEventListener('click', () => navigateTo('community-home'));
  });

  /* --- Home buttons --- */
  document.getElementById('go-create')?.addEventListener('click', () => navigateTo('create'));
  document.getElementById('go-join')?.addEventListener('click',   () => navigateTo('join'));

  /* --- Community: create button on landing --- */
  document.getElementById('create-community-btn')?.addEventListener('click', () =>
    navigateTo('create-community')
  );

  /* --- Create community form submit --- */
  document.getElementById('cc-submit')?.addEventListener('click', async () => {
    const name     = (document.getElementById('cc-name')?.value     || '').trim();
    const password = (document.getElementById('cc-password')?.value || '').trim();
    if (!name)                    { toast('Name ist Pflichtfeld.', 'error'); return; }
    if (!password || password.length < 3) { toast('Passwort mind. 3 Zeichen.', 'error'); return; }
    setBtn('cc-submit', true);
    try {
      const c = await createCommunity(name, password);
      state.currentCommunityId = c.id;
      state.currentCommunity   = c;
      toast('✓ Community erstellt!');
      await navigateTo('community-home');
    } catch (e) {
      toast(e.message, 'error');
      setBtn('cc-submit', false, 'Community anlegen →');
    }
  });

  /* --- Community: enter from card --- */
  document.querySelectorAll('[data-enter-community]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const communityId = btn.dataset.enterCommunity;
      if (state.myCommunityIds.has(communityId)) {
        // Already a member — go straight in
        state.currentCommunityId = communityId;
        state.currentCommunity   = state.communities.find(c => c.id === communityId);
        await navigateTo('community-home');
      } else {
        // Ask for password
        const pw = prompt(`Passwort für „${state.communities.find(c=>c.id===communityId)?.name}":`);
        if (pw === null) return;
        try {
          await joinCommunity(communityId, pw);
          await navigateTo('community-home');
        } catch (e) { toast(e.message, 'error'); }
      }
    });
  });

  /* --- Community home: back to communities --- */
  document.getElementById('back-communities')?.addEventListener('click', () => navigateTo('communities'));

  /* --- Planning page button --- */
  document.getElementById('planning-btn')?.addEventListener('click', () => navigateTo('planning'));

  /* --- Planning page events (if on planning view) --- */
  if (state.view === 'planning') attachPlanningEvents();

  /* --- Community home: open tour card --- */
  document.querySelectorAll('[data-open-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      navigateTo('tour', { currentTourId: btn.dataset.openId, currentTab: 'map' });
    });
  });

  /* --- Community home: join tour (no password needed anymore) --- */
  document.querySelectorAll('[data-join-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await joinTour(btn.dataset.joinId);
        await navigateTo('tour', { currentTourId: btn.dataset.joinId, currentTab: 'map' });
      } catch (e) { toast(e.message, 'error'); }
    });
  });

  /* --- Community: create tour button --- */
  document.getElementById('create-tour-btn')?.addEventListener('click', () => navigateTo('create'));

  /* --- Community: leave --- */
  document.getElementById('leave-community-btn')?.addEventListener('click', async () => {
    if (!confirm('Community wirklich verlassen?')) return;
    try {
      await leaveCommunity();
      toast('Community verlassen.');
      await navigateTo('communities');
    } catch (e) { toast(e.message, 'error'); }
  });

  /* --- Community: settings button --- */
  document.getElementById('community-settings-btn')?.addEventListener('click', () =>
    navigateTo('community-settings')
  );

  /* --- Community settings: back --- */
  document.getElementById('back-community-home')?.addEventListener('click', () =>
    navigateTo('community-home')
  );

  /* --- Community settings: save --- */
  document.getElementById('cs-save')?.addEventListener('click', async () => {
    const name     = (document.getElementById('cs-name')?.value     || '').trim();
    const password = (document.getElementById('cs-password')?.value || '').trim();
    if (!name)     { toast('Name darf nicht leer sein.', 'error'); return; }
    if (!password || password.length < 3) { toast('Passwort mind. 3 Zeichen.', 'error'); return; }
    setBtn('cs-save', true);
    try {
      await updateCommunity({ name, password });
      toast('✓ Einstellungen gespeichert');
      const h = document.querySelector('.page-sub');
      if (h) h.textContent = name;
    } catch (e) { toast(e.message, 'error'); }
    setBtn('cs-save', false, 'Speichern');
  });

  /* --- Community settings: promote to co-admin --- */
  document.querySelectorAll('[data-promote-community]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await promoteCommunityAdmin(btn.dataset.promoteCommunity);
        toast('✓ Co-Admin gesetzt');
        await navigateTo('community-settings');
      } catch (e) { toast(e.message, 'error'); }
    });
  });

  /* --- Community settings: demote co-admin --- */
  document.querySelectorAll('[data-demote-community]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await demoteCommunityAdmin(btn.dataset.demoteCommunity);
        toast('Co-Admin entfernt');
        await navigateTo('community-settings');
      } catch (e) { toast(e.message, 'error'); }
    });
  });

  /* --- Community settings: kick member --- */
  document.querySelectorAll('[data-kick-community]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const username = state.profileCache[btn.dataset.kickCommunity] || btn.dataset.kickCommunity;
      if (!confirm(`„${username}" aus der Community entfernen?`)) return;
      try {
        await removeCommunityMember(btn.dataset.kickCommunity);
        toast(`${username} entfernt`);
        await navigateTo('community-settings');
      } catch (e) { toast(e.message, 'error'); }
    });
  });

  /* Copy invite link */
  document.querySelectorAll('[data-copy-id]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      copyTourLink(el.dataset.copyId);
    });
  });

  /* Open / join from tour card buttons */
  document.querySelectorAll('[data-open-id]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      navigateTo('tour', { currentTourId: el.dataset.openId, currentTab: 'map' });
    });
  });
  document.querySelectorAll('[data-join-id]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      state.preJoinId = el.dataset.joinId;
      navigateTo('join');
    });
  });

  /* Click anywhere on a card that belongs to the user → open tour */
  document.querySelectorAll('.tour-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('[data-open-id]') || e.target.closest('[data-join-id]')) return;
      const id = card.dataset.tourId;
      if (state.myTourIds.has(id)) navigateTo('tour', { currentTourId: id, currentTab: 'map' });
    });
  });

  /* --- Home calendar navigation --- */
  document.getElementById('cal-prev')?.addEventListener('click', () => {
    state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() - 1, 1);
    render();
  });
  document.getElementById('cal-next')?.addEventListener('click', () => {
    state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + 1, 1);
    render();
  });
  document.getElementById('cal-show-all')?.addEventListener('change', e => {
    state.calShowAll = e.target.checked;
    render();
  });

  /* --- Create tour form --- */
  document.getElementById('create-submit')?.addEventListener('click', async () => {
    const name  = (document.getElementById('f-name')?.value  || '').trim();
    const desc  = (document.getElementById('f-desc')?.value  || '').trim();
    const date  =  document.getElementById('f-date')?.value  || '';
    const edate =  document.getElementById('f-edate')?.value || '';
    const dest  = (document.getElementById('f-dest')?.value  || '').trim();

    if (!name) { toast('Tour-Name ist Pflichtfeld.', 'error'); return; }
    if (!date) { toast('Startdatum ist Pflichtfeld.', 'error'); return; }

    setBtn('create-submit', true);
    try {
      const t = await createTour({
        name, description: desc, date,
        end_date: edate || null,
        destination: dest,
        distance: '',
      });
      state.myTourIds.add(t.id);
      toast('✓ Tour erstellt!');
      await navigateTo('tour', { currentTourId: t.id, currentTab: 'map' });
    } catch (e) {
      toast(e.message, 'error');
      setBtn('create-submit', false, 'Tour anlegen →');
    }
  });

  /* --- Join tour form (legacy) --- */
  document.getElementById('join-submit')?.addEventListener('click', async () => {
    const id = document.getElementById('join-sel')?.value || '';
    if (!id) { toast('Bitte eine Tour auswählen.', 'error'); return; }
    setBtn('join-submit', true);
    try {
      await joinTour(id);
      toast('✓ Willkommen in der Tour! 🏍️');
      await navigateTo('tour', { currentTourId: id, currentTab: 'map' });
    } catch (e) {
      toast(e.message, 'error');
      setBtn('join-submit', false, 'Beitreten →');
    }
  });

  /* --- Participants: promote / demote --- */
  attachParticipantEvents();

  /* --- Tour tabs (only wire up when on tour view) --- */
  document.querySelectorAll('.tab-btn:not(.plan-tab-btn)').forEach(btn => {
    btn.addEventListener('click', async () => {
      state.currentTab = btn.dataset.tab;
      if (state.currentTab === 'chat')      await loadMessages();
      if (state.currentTab === 'changelog') await loadChangelog();

      // Mark as seen → clear badge, recompute
      markTabSeen(state.currentTourId, state.currentTab);
      computeTabBadges(state.currentTourId);

      document.querySelectorAll('.tab-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.tab === state.currentTab)
      );
      // Re-render tab bar to remove the badge
      _refreshTabBar();

      const tc = document.getElementById('tab-content');
      if (tc && state.currentTour) {
        tc.innerHTML = renderTab(state.currentTour);
        afterTabRender();
      }
    });
  });

  /* --- Initial tab setup (on tour page) --- */
  if (state.view === 'tour') {
    // Mark the initially active tab as seen
    markTabSeen(state.currentTourId, state.currentTab);
    computeTabBadges(state.currentTourId);
    afterTabRender();
  }
}

/* ----------------------------------------------------------
   After tab content is injected into #tab-content,
   wire up tab-specific events.
   ---------------------------------------------------------- */

function afterTabRender() {
  if (state.currentTab === 'map') {
    setTimeout(() => {
      initMap(state.currentTour);
      attachMapEvents();
      attachSidebarEvents();
    }, 80);
  }
  if (state.currentTab === 'chat') {
    setTimeout(() => {
      const el = document.getElementById('chat-msgs');
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
    attachChatEvents();
    // Reload messages that arrived while on another tab
    loadMessages().then(() => {
      const tc = document.getElementById('tab-content');
      if (tc && state.currentTour && state.currentTab === 'chat') {
        tc.innerHTML = renderTab(state.currentTour);
        attachChatEvents();
        const el = document.getElementById('chat-msgs');
        if (el) el.scrollTop = el.scrollHeight;
      }
    });
  }
  if (state.currentTab === 'info') {
    attachInfoEvents();
  }
  if (state.currentTab === 'participants') {
    attachParticipantEvents();
  }
}

/**
 * Re-render only the tab bar (to update badges) without touching tab content.
 */
function _refreshTabBar() {
  const tour = state.currentTour;
  if (!tour) return;
  const tabs = [
    { id: 'map',          label: '🗺️ Karte' },
    { id: 'chat',         label: '💬 Chat' },
    { id: 'participants', label: '👥 Teilnehmer' },
    { id: 'info',         label: '📋 Info & Kalender' },
    { id: 'changelog',    label: '📝 Change Log' },
  ];
  const bar = document.querySelector('.tour-tabs');
  if (!bar) return;
  bar.innerHTML = tabs.map(t => {
    const badge    = state.tabBadges[t.id];
    const isActive = state.currentTab === t.id;
    const tooltipLines = badge
      ? badge.slice(0, 5).map(b => {
          const time = b.time.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });
          const date = b.time.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' });
          return `${date} ${time}  ${b.text}`;
        }).join('&#10;')
      : '';
    return `<button class="tab-btn ${isActive ? 'active' : ''}" data-tab="${t.id}">
      ${t.label}
      ${badge && !isActive
        ? `<span class="tab-badge" title="${tooltipLines}">${badge.length > 9 ? '9+' : badge.length}</span>`
        : ''}
    </button>`;
  }).join('');
  // Re-attach tab click handlers on the new buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      state.currentTab = btn.dataset.tab;
      if (state.currentTab === 'chat')      await loadMessages();
      if (state.currentTab === 'changelog') await loadChangelog();
      markTabSeen(state.currentTourId, state.currentTab);
      computeTabBadges(state.currentTourId);
      _refreshTabBar();
      const tc = document.getElementById('tab-content');
      if (tc && state.currentTour) { tc.innerHTML = renderTab(state.currentTour); afterTabRender(); }
    });
  });
}

/* ----------------------------------------------------------
   Participants tab events
   ---------------------------------------------------------- */

function attachParticipantEvents() {
  document.querySelectorAll('[data-promote]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await promoteToAdmin(btn.dataset.promote);
        toast('✓ Co-Admin gesetzt');
        const tc = document.getElementById('tab-content');
        if (tc) { tc.innerHTML = renderTab(state.currentTour); attachParticipantEvents(); }
      } catch (e) { toast(e.message, 'error'); }
    });
  });

  document.querySelectorAll('[data-demote]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await demoteAdmin(btn.dataset.demote);
        toast('Co-Admin entfernt');
        const tc = document.getElementById('tab-content');
        if (tc) { tc.innerHTML = renderTab(state.currentTour); attachParticipantEvents(); }
      } catch (e) { toast(e.message, 'error'); }
    });
  });

  document.querySelectorAll('[data-kick]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const username = state.profileCache[btn.dataset.kick] || btn.dataset.kick;
      if (!confirm(`„${username}" aus der Tour entfernen?`)) return;
      try {
        await kickTourMember(btn.dataset.kick);
        toast(`${username} entfernt`);
        const tc = document.getElementById('tab-content');
        if (tc) { tc.innerHTML = renderTab(state.currentTour); attachParticipantEvents(); }
      } catch (e) { toast(e.message, 'error'); }
    });
  });
}

/* ----------------------------------------------------------
   Map tab events
   ---------------------------------------------------------- */

/* ----------------------------------------------------------
   CSS-based fullscreen helpers (cross-platform / iOS compatible)
   ---------------------------------------------------------- */

function _cssFullscreen(container, enable) {
  container.classList.toggle('map-fullscreen-active', enable);
  // Prevent body scroll while fullscreen
  document.body.style.overflow = enable ? 'hidden' : '';
  _updateFsUi(container, enable);
}

function _updateFsUi(container, isFs) {
  container.classList.toggle('map-fullscreen-active', isFs);
  document.body.style.overflow = isFs ? 'hidden' : '';

  // Support both tour map (map-fs-icon) and plan map (plan-fs-icon) icons
  const icon  = container.querySelector('[id$="-fs-icon"]')  || document.getElementById('map-fs-icon')  || document.getElementById('plan-fs-icon');
  const label = container.querySelector('[id$="-fs-label"]') || document.getElementById('map-fs-label') || document.getElementById('plan-fs-label');
  if (icon)  icon.textContent  = isFs ? '✕' : '⛶';
  if (label) label.textContent = isFs ? 'Vollbild beenden' : 'Vollbild';

  // Invalidate whichever map is active
  setTimeout(() => {
    mapInstance?.invalidateSize();
    _planMapInstance?.invalidateSize();
  }, 200);
}

function attachMapEvents() {
  /* Fullscreen toggle — CSS-based for mobile compatibility (iOS Safari
     does not support requestFullscreen on non-video elements) */
  document.getElementById('map-fullscreen')?.addEventListener('click', () => {
    _toggleFullscreen(document.getElementById('map-container'));
  });  // Native fullscreen change (desktop)
  document.getElementById('map-container')?.addEventListener('fullscreenchange', () => {
    const container = document.getElementById('map-container');
    if (!container) return;
    const isFs = !!document.fullscreenElement;
    _updateFsUi(container, isFs);
  });
  document.getElementById('map-container')?.addEventListener('webkitfullscreenchange', () => {
    const container = document.getElementById('map-container');
    if (!container) return;
    const isFs = !!document.webkitFullscreenElement;
    _updateFsUi(container, isFs);
  });

  // Close CSS fullscreen with Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const container = document.getElementById('map-container');
      if (container?.classList.contains('map-fullscreen-active')) {
        _cssFullscreen(container, false);
      }
    }
  }, { once: false });

  /* GPX upload (admin only) */
  document.getElementById('gpx-up')?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;

    const text = await file.text();
    const data = parseGPX(text);

    const totalPts = data.tracks.reduce((s, t) => s + t.points.length, 0);
    if (!totalPts && !data.waypoints.length) {
      toast('Keine Route oder Wegpunkte in GPX-Datei gefunden.', 'error'); return;
    }

    try {
      await saveGPX(data);
      const summary = [
        data.tracks.length    ? `${data.tracks.length} Track${data.tracks.length !== 1 ? 's' : ''}` : '',
        data.waypoints.length ? `${data.waypoints.length} Wegpunkt${data.waypoints.length !== 1 ? 'e' : ''}` : '',
      ].filter(Boolean).join(' · ');
      toast(`✓ Gespeichert: ${summary} — Distanz im Seitenmenü auswählen`);
      _refreshMapTab();
    } catch (e) { toast(e.message, 'error'); }
  });

  document.getElementById('gpx-dl')?.addEventListener('click', () => {
    downloadGPX(state.currentTour);
  });

  /* Delete route (admin only) */
  document.getElementById('gpx-del')?.addEventListener('click', async () => {
    try {
      await deleteGPX();
      clearRouteFromMap();
      toast('Route gelöscht');
      _refreshMapTab();
    } catch (e) { toast(e.message, 'error'); }
  });
}

/* ----------------------------------------------------------
   Map sidebar: track & waypoint click-to-highlight
   ---------------------------------------------------------- */

function attachSidebarEvents() {
  let activeTrackIdx = null;
  let activeWpIdx    = null;

  const allItems = document.querySelectorAll('.map-sidebar-item[data-track-idx], .map-sidebar-item[data-wp-idx]');

  function setActive(el) {
    document.querySelectorAll('.map-sidebar-item').forEach(i => i.classList.remove('active'));
    if (el) el.classList.add('active');
  }

  /* Waypoint visibility toggle */
  document.getElementById('toggle-waypoints')?.addEventListener('click', e => {
    e.stopPropagation();
    const btn     = e.currentTarget;
    const visible = toggleWaypoints();
    btn.textContent = visible ? '👁 Alle' : '🚫 Alle';
    btn.classList.toggle('map-sidebar-toggle--off', !visible);
    // Dim sidebar items when hidden
    document.querySelectorAll('[data-wp-idx]').forEach(el =>
      el.style.opacity = visible ? '' : '0.35'
    );
  });

  /* Track items */
  document.querySelectorAll('[data-track-idx]').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.trackIdx);
      if (activeTrackIdx === idx) {
        resetHighlight();
        setActive(null);
        activeTrackIdx = null;
      } else {
        highlightTrack(idx);
        setActive(el);
        activeTrackIdx = idx;
        activeWpIdx    = null;
      }
    });
  });

  /* Waypoint items */
  document.querySelectorAll('[data-wp-idx]').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.wpIdx);
      if (activeWpIdx === idx) {
        resetHighlight();
        setActive(null);
        activeWpIdx = null;
      } else {
        highlightWaypoint(idx);
        setActive(el);
        activeWpIdx    = idx;
        activeTrackIdx = null;
      }
    });
  });

  /* Reset button */
  document.getElementById('reset-highlight')?.addEventListener('click', () => {
    resetHighlight();
    setActive(null);
    activeTrackIdx = null;
    activeWpIdx    = null;
  });
}

/** Re-render the map tab HTML, then re-init map + events. */
function _refreshMapTab() {
  const tc = document.getElementById('tab-content');
  if (!tc) return;
  tc.innerHTML = renderTab(state.currentTour);
  setTimeout(() => { initMap(state.currentTour); attachMapEvents(); }, 80);
}

/* ----------------------------------------------------------
   Chat tab events + Realtime subscription
   ---------------------------------------------------------- */

function attachChatEvents() {
  const doSend = async () => {
    const input = document.getElementById('chat-in');
    const text  = (input?.value || '').trim();
    if (!text) return;
    input.value = '';
    try {
      await sendMessage(text);
      // Realtime will append the message via the subscription
    } catch (e) {
      toast(e.message, 'error');
      input.value = text;
    }
  };

  document.getElementById('chat-send')?.addEventListener('click', doSend);
  document.getElementById('chat-in')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') doSend();
  });
}

/**
 * Append a single message to the chat DOM without a full re-render.
 * Called by the Realtime subscription handler.
 * @param {object} msg – row from the messages table
 */
function _appendChatMessage(msg) {
  const container = document.getElementById('chat-msgs');
  if (!container) return; // chat tab not visible

  const mine = msg.user_id === state.currentUser?.id;
  const dt   = new Date(msg.created_at);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const isToday     = dt.toDateString() === today.toDateString();
  const isYesterday = dt.toDateString() === yesterday.toDateString();
  const datePart = isToday ? 'Heute' : isYesterday ? 'Gestern'
    : dt.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'2-digit' });
  const timePart = dt.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });

  // If user is on chat tab → mark seen; otherwise update badge
  if (state.currentTab === 'chat') {
    markTabSeen(state.currentTourId, 'chat');
  } else {
    computeTabBadges(state.currentTourId);
    _refreshTabBar();
    return; // don't try to append to invisible DOM
  }

  // Remove empty-state placeholder if present
  const empty = container.querySelector('div[style*="flex:1"]') || container.querySelector('div[style*="flex: 1"]');
  if (empty) empty.remove();

  const el = document.createElement('div');
  el.className = `chat-msg ${mine ? 'mine' : ''}`;
  el.innerHTML = `
    <div class="chat-bubble">${esc(msg.text)}</div>
    <div class="chat-meta">${esc(msg.username)} · ${datePart}, ${timePart}</div>
  `;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

/* ----------------------------------------------------------
   Info tab events
   ---------------------------------------------------------- */

function attachInfoEvents() {
  /* Distance dropdown: show/hide manual input */
  document.getElementById('dist-source')?.addEventListener('change', e => {
    const wrap = document.getElementById('dist-manual-wrap');
    if (wrap) wrap.style.display = e.target.value === 'manual' ? 'block' : 'none';
  });

  /* Save edits (name + dates + destination + description + optional distance) */
  document.getElementById('edit-save')?.addEventListener('click', async () => {
    const name  = (document.getElementById('edit-name')?.value  || '').trim();
    const date  =  document.getElementById('edit-date')?.value  || '';
    const edate =  document.getElementById('edit-edate')?.value || '';
    if (!name) { toast('Tour-Name darf nicht leer sein.', 'error'); return; }
    if (!date) { toast('Startdatum darf nicht leer sein.', 'error'); return; }

    // Distance from dropdown (if present)
    const distSource = document.getElementById('dist-source')?.value;
    let dist = '';
    if (distSource) {
      const gpxData = normalizeGPXRoute(state.currentTour?.gpx_route);
      if (distSource === 'total' && gpxData)       dist = calculateTotalDistance(gpxData);
      else if (distSource.startsWith('track:') && gpxData) dist = calculateTrackDistance(gpxData, parseInt(distSource.split(':')[1]));
      else if (distSource === 'manual') dist = (document.getElementById('dist-manual')?.value || '').trim();
    }

    const updates = {
      name,
      date,
      end_date:    edate || null,
      destination: (document.getElementById('edit-dest')?.value || '').trim(),
      description: (document.getElementById('edit-desc')?.value || '').trim(),
      ...(dist ? { distance: dist } : {}),
    };
    try {
      await updateTourInfo(updates);
      toast('✓ Gespeichert');
      const hn = document.querySelector('.tour-detail-title'); if (hn) hn.textContent = name;
      const hd = document.getElementById('hdr-dest'); if (hd) hd.textContent = '📍 ' + (updates.destination || 'Kein Ziel');
      const id = document.getElementById('info-dest'); if (id) id.textContent = updates.destination || '—';
      if (dist) { const hdi = document.getElementById('hdr-dist'); if (hdi) hdi.textContent = '📏 ' + dist; }
    } catch (e) { toast(e.message, 'error'); }
  });

  /* Delete tour (admin only) */
  document.getElementById('delete-tour-btn')?.addEventListener('click', async () => {
    const name = state.currentTour?.name || 'diese Tour';
    if (!confirm(`„${name}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)) return;
    setBtn('delete-tour-btn', true, '');
    try {
      await deleteTour();
      toast('Tour gelöscht');
      await navigateTo('community-home');
    } catch (e) { toast(e.message, 'error'); setBtn('delete-tour-btn', false, '🗑️ Tour endgültig löschen'); }
  });

  /* Leave tour (non-admin members) */
  document.getElementById('leave-tour-btn')?.addEventListener('click', async () => {
    const name = state.currentTour?.name || 'diese Tour';
    if (!confirm(`„${name}" wirklich verlassen?`)) return;
    setBtn('leave-tour-btn', true, '');
    try {
      await leaveTour();
      toast('Du hast die Tour verlassen.');
      await navigateTo('community-home');
    } catch (e) { toast(e.message, 'error'); setBtn('leave-tour-btn', false, '🚪 Tour verlassen'); }
  });

  /* Tour calendar navigation */
  document.getElementById('tcal-prev')?.addEventListener('click', () => {
    state.tourCalMonth = new Date(state.tourCalMonth.getFullYear(), state.tourCalMonth.getMonth() - 1, 1);
    _refreshInfoTab();
  });
  document.getElementById('tcal-next')?.addEventListener('click', () => {
    state.tourCalMonth = new Date(state.tourCalMonth.getFullYear(), state.tourCalMonth.getMonth() + 1, 1);
    _refreshInfoTab();
  });

  /* Add plan date */
  document.getElementById('add-date-btn')?.addEventListener('click', async () => {
    const d = document.getElementById('add-date')?.value || '';
    const l = (document.getElementById('add-label')?.value || '').trim();
    if (!d) { toast('Bitte Datum wählen.', 'error'); return; }
    try {
      await addPlanDate(d, l);
      _refreshInfoTab();
    } catch (e) { toast(e.message, 'error'); }
  });

  /* Delete plan dates */
  document.querySelectorAll('[data-del-date]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await deletePlanDate(btn.dataset.delDate);
        _refreshInfoTab();
      } catch (e) { toast(e.message, 'error'); }
    });
  });
}

/** Re-render the info tab HTML and re-attach its events. */
function _refreshInfoTab() {
  const tc = document.getElementById('tab-content');
  if (!tc) return;
  tc.innerHTML = renderTab(state.currentTour);
  attachInfoEvents();
}

/* ==============================================================
   Planning page events
   ============================================================== */

function attachPlanningEvents() {
  attachPlanningTabHandlers();
  attachPlanningContentEvents();
}

/** Wire up tab buttons and back button — call only once per page render */
function attachPlanningTabHandlers() {
  /* Tab switching */
  document.querySelectorAll('.plan-tab-btn').forEach(btn => {
    // Remove existing listeners by replacing the node
    const fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
    fresh.addEventListener('click', async () => {
      state.planningTab = fresh.dataset.planTab;
      const tc = document.getElementById('plan-tab-content');
      if (!tc) return;

      switch (state.planningTab) {
        case 'polls': tc.innerHTML = renderPlanPolls();  attachPlanningContentEvents(); break;
        case 'map':   tc.innerHTML = renderPlanMap();    _initPlanMap(); attachPlanningContentEvents(); break;
        case 'chat':  tc.innerHTML = renderPlanChat();   _scrollPlanChat(); attachPlanningContentEvents(); break;
        case 'log':   tc.innerHTML = renderPlanLog();    break;
      }

      // Update active state
      document.querySelectorAll('.plan-tab-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.planTab === state.planningTab)
      );
    });
  });

  /* Back button */
  document.getElementById('back-community-home')?.addEventListener('click', () =>
    navigateTo('community-home')
  );

  /* Init content for initial tab */
  if (state.planningTab === 'map') setTimeout(_initPlanMap, 80);
  if (state.planningTab === 'chat') _scrollPlanChat();
}

/** Wire up handlers inside #plan-tab-content — safe to call multiple times */
function attachPlanningContentEvents() {
  /* ── Year calendar nav ── */
  document.getElementById('ycal-prev')?.addEventListener('click', () => {
    if (!state.planCalYear) state.planCalYear = new Date().getFullYear();
    state.planCalYear--;
    const sidebar = document.querySelector('.plan-polls-sidebar');
    if (sidebar) { sidebar.innerHTML = renderPlanYearCal(); attachPlanningContentEvents(); }
  });
  document.getElementById('ycal-next')?.addEventListener('click', () => {
    if (!state.planCalYear) state.planCalYear = new Date().getFullYear();
    state.planCalYear++;
    const sidebar = document.querySelector('.plan-polls-sidebar');
    if (sidebar) { sidebar.innerHTML = renderPlanYearCal(); attachPlanningContentEvents(); }
  });

  /* ── Poll form toggle ── */
  document.getElementById('poll-toggle-form')?.addEventListener('click', () => {
    const form = document.getElementById('poll-create-form');
    const btn  = document.getElementById('poll-toggle-form');
    if (!form) return;
    const open = form.style.display === 'none' || form.style.display === '';
    form.style.display = open ? 'block' : 'none';
    if (btn) btn.textContent = open ? '✕ Abbrechen' : '+ Neue Abfrage';
  });

  /* ── Poll type toggle: show/hide date fields and year selector ── */
  document.getElementById('poll-type')?.addEventListener('change', e => {
    const isYearly = e.target.value === 'yearly';
    const yearWrap = document.getElementById('poll-year-wrap');
    if (yearWrap) yearWrap.style.display = isYearly ? 'block' : 'none';
    document.querySelectorAll('.poll-option-dates').forEach(el => {
      el.style.display = isYearly ? 'inline-flex' : 'none';
    });
  });

  /* ── Poll: add option ── */
  document.getElementById('poll-add-option')?.addEventListener('click', () => {
    const list = document.getElementById('poll-options-list');
    if (!list) return;
    const isYearly = document.getElementById('poll-type')?.value === 'yearly';
    const count = list.querySelectorAll('.poll-option-input').length + 1;
    const row = document.createElement('div');
    row.className = 'poll-option-row';
    row.style.marginTop = '6px';
    row.innerHTML = `
      <input type="text" class="poll-option-input" placeholder="Option ${count}" />
      <span class="poll-option-dates" style="display:${isYearly ? 'inline-flex' : 'none'}">
        <input type="date" class="poll-date-start" style="width:130px" />
        <span style="color:var(--muted);font-size:12px">–</span>
        <input type="date" class="poll-date-end" style="width:130px" />
      </span>`;
    list.appendChild(row);
    row.querySelector('.poll-option-input')?.focus();
  });

  /* ── Poll: submit ── */
  document.getElementById('poll-submit')?.addEventListener('click', async () => {
    const question  = (document.getElementById('poll-question')?.value || '').trim();
    const pollType  = document.getElementById('poll-type')?.value || 'general';
    const pollYear  = pollType === 'yearly'
      ? parseInt(document.getElementById('poll-year')?.value || new Date().getFullYear())
      : null;
    const multi     = document.getElementById('poll-multi')?.checked || false;

    const rows       = [...document.querySelectorAll('.poll-option-row')];
    const optionInputs = rows.map(r => r.querySelector('.poll-option-input')?.value.trim()).filter(Boolean);

    if (!question)                { toast('Frage eingeben.', 'error'); return; }
    if (optionInputs.length < 2)  { toast('Mindestens 2 Optionen.', 'error'); return; }

    const options = rows
      .map((r, i) => {
        const text = r.querySelector('.poll-option-input')?.value.trim();
        if (!text) return null;
        const opt = { id: String(i + 1), text };
        if (pollType === 'yearly') {
          opt.date_start = r.querySelector('.poll-date-start')?.value || null;
          opt.date_end   = r.querySelector('.poll-date-end')?.value   || null;
        }
        return opt;
      })
      .filter(Boolean);

    // Check for duplicate yearly poll
    if (pollType === 'yearly') {
      const exists = state.communityPolls.find(p => p.poll_type === 'yearly' && p.poll_year === pollYear);
      if (exists && !confirm(`Es gibt bereits eine Jahresplanung für ${pollYear}. Trotzdem erstellen?`)) return;
    }

    setBtn('poll-submit', true);
    try {
      await createPoll(question, options, multi, pollType, pollYear);
      toast('✓ Abfrage erstellt');
      const tc = document.getElementById('plan-tab-content');
      if (tc) { tc.innerHTML = renderPlanPolls(); attachPlanningContentEvents(); }
    } catch (e) { toast(e.message, 'error'); }
    setBtn('poll-submit', false, 'Abfrage erstellen');
  });

  /* ── Poll: vote (click on option) ── */
  document.querySelectorAll('.poll-option[data-poll-id]').forEach(el => {
    el.addEventListener('click', async () => {
      const pollId = el.dataset.pollId;
      const optId  = el.dataset.optId;
      const poll   = state.communityPolls.find(p => p.id === pollId);
      if (!poll || poll.closed) return;

      const myVote = poll.votes.find(v => v.user_id === state.currentUser.id);
      let newOptIds = [...(myVote?.option_ids || [])];

      if (poll.multi) {
        if (newOptIds.includes(optId)) newOptIds = newOptIds.filter(id => id !== optId);
        else newOptIds.push(optId);
      } else {
        newOptIds = newOptIds[0] === optId ? [] : [optId];
      }

      try {
        await votePoll(pollId, newOptIds);
        const tc = document.getElementById('plan-tab-content');
        if (tc) { tc.innerHTML = renderPlanPolls(); attachPlanningContentEvents(); }
      } catch (e) { toast(e.message, 'error'); }
    });
  });

  /* ── Poll: reset vote ── */
  document.querySelectorAll('[data-reset-vote]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      try {
        await votePoll(btn.dataset.resetVote, []);
        const tc = document.getElementById('plan-tab-content');
        if (tc) { tc.innerHTML = renderPlanPolls(); attachPlanningContentEvents(); }
      } catch (e) { toast(e.message, 'error'); }
    });
  });

  /* ── Poll: close ── */
  document.querySelectorAll('[data-close-poll]').forEach(btn => {
    if (btn._planEvt) return; btn._planEvt = true;
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      try {
        await closePoll(btn.dataset.closePoll);
        const tc = document.getElementById('plan-tab-content');
        if (tc) { tc.innerHTML = renderPlanPolls(); attachPlanningContentEvents(); }
      } catch (e) { toast(e.message, 'error'); }
    });
  });

  /* ── Poll: delete ── */
  document.querySelectorAll('[data-delete-poll]').forEach(btn => {
    if (btn._planEvt) return; btn._planEvt = true;
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Abfrage wirklich löschen?')) return;
      try {
        await deletePoll(btn.dataset.deletePoll);
        const tc = document.getElementById('plan-tab-content');
        if (tc) { tc.innerHTML = renderPlanPolls(); attachPlanningContentEvents(); }
      } catch (e) { toast(e.message, 'error'); }
    });
  });

  /* ── Plan Map: fullscreen ── */
  document.getElementById('plan-map-fullscreen')?.addEventListener('click', () => {
    _toggleFullscreen(document.getElementById('plan-map-container'));
  });
  document.getElementById('plan-map-container')?.addEventListener('fullscreenchange', () => {
    const isFs = !!document.fullscreenElement;
    _updateFsUi(document.getElementById('plan-map-container'), isFs);
    const icon  = document.getElementById('plan-fs-icon');
    const label = document.getElementById('plan-fs-label');
    if (icon)  icon.textContent  = isFs ? '✕' : '⛶';
    if (label) label.textContent = isFs ? 'Vollbild beenden' : 'Vollbild';
    setTimeout(() => _planMapInstance?.invalidateSize(), 200);
  });

  /* ── Plan Map: toggle track visibility ── */
  document.querySelectorAll('.plan-track-toggle').forEach(cb => {
    cb.addEventListener('change', () => {
      state.planMapVisible[cb.dataset.tourId] = cb.checked;
      _updatePlanMapLayers();
    });
  });

  /* ── Plan Chat: send ── */
  const planSend = async () => {
    const inp = document.getElementById('plan-chat-input');
    const text = (inp?.value || '').trim();
    if (!text) return;
    if (inp) inp.value = '';
    try {
      const msg = await sendCommunityMessage(text);
      _appendPlanChatMessage(msg);
    } catch (e) { toast(e.message, 'error'); }
  };

  document.getElementById('plan-chat-send')?.addEventListener('click', planSend);
  document.getElementById('plan-chat-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); planSend(); }
  });
}


/* ── Plan map helpers ─────────────────────────────────────── */

let _planMapInstance = null;
let _planMapLayers   = [];

/** Returns true on iOS Safari where native fullscreen doesn't work for divs */
function _isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS
}

/** Enter or exit fullscreen for a map container — works on all platforms */
function _toggleFullscreen(container, fsIcon, fsLabel, mapRef) {
  if (!container) return;

  const isFs = container.classList.contains('map-fullscreen-active')
             || !!document.fullscreenElement
             || !!document.webkitFullscreenElement;

  if (!isFs) {
    if (_isIOS()) {
      // iOS Safari: CSS only — native API silently fails for divs
      _cssFullscreen(container, true);
    } else if (document.fullscreenEnabled && container.requestFullscreen) {
      container.requestFullscreen().catch(() => _cssFullscreen(container, true));
    } else if (container.webkitRequestFullscreen) {
      container.webkitRequestFullscreen(); // Safari desktop
    } else {
      _cssFullscreen(container, true);
    }
  } else {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (document.webkitFullscreenElement) {
      document.webkitExitFullscreen();
    } else {
      _cssFullscreen(container, false);
    }
  }
}

function _initPlanMap() {
  const el = document.getElementById('plan-map');
  if (!el) return;

  // Destroy existing instance cleanly
  if (_planMapInstance) {
    try { _planMapInstance.stop(); _planMapInstance.remove(); } catch(e) {}
    _planMapInstance = null;
    _planMapLayers   = [];
  }

  _planMapInstance = L.map('plan-map', {
    center: [48.2, 9.5], zoom: 7, zoomControl: true,
    // Disable zoom animation to avoid _leaflet_pos crash on unmount
    zoomAnimation: false,
    fadeAnimation:  false,
  });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors', maxZoom: 19,
  }).addTo(_planMapInstance);

  const tours = state.communityToursGpx || [];
  const allTours = state.tours || [];
  const allBounds = [];

  tours.forEach(t => {
    const gpx = normalizeGPXRoute(t.gpx_route);
    if (!gpx?.tracks?.length) return;
    const visible = state.planMapVisible[t.id] !== false;

    // Use same color as calendar: position in state.tours
    const idxInAll = allTours.findIndex(x => x.id === t.id);
    const tourColor = TOUR_PALETTE[Math.max(0, idxInAll) % TOUR_PALETTE.length];

    gpx.tracks.forEach((track, i) => {
      if (!track.points?.length) return;
      // Use tour palette color (not track.color) for consistency with calendar
      const color = tourColor;
      const latlngs = track.points.map(([lat, lon]) => [lat, lon]);
      const layer = L.polyline(latlngs, { color, weight: 3.5, opacity: 0.9 });

      if (visible) {
        layer.addTo(_planMapInstance);
        allBounds.push(layer.getBounds());
      }

      _planMapLayers.push({ layer, tourId: t.id, visible });
    });
  });

  if (allBounds.length) {
    const combined = allBounds.reduce((acc, b) => acc.extend(b));
    _planMapInstance.fitBounds(combined, { padding: [30, 30] });
  }
}

function _updatePlanMapLayers() {
  _planMapLayers.forEach(item => {
    const visible = state.planMapVisible[item.tourId] !== false;
    if (visible && !item.visible) {
      item.layer.addTo(_planMapInstance);
      item.visible = true;
    } else if (!visible && item.visible) {
      _planMapInstance.removeLayer(item.layer);
      item.visible = false;
    }
  });
  _planMapInstance?.invalidateSize();
}

function _scrollPlanChat() {
  setTimeout(() => {
    const el = document.getElementById('plan-chat-msgs');
    if (el) el.scrollTop = el.scrollHeight;
  }, 50);
}

function _appendPlanChatMessage(msg) {
  const el = document.getElementById('plan-chat-msgs');
  if (!el) return;
  const isMe = msg.user_id === state.currentUser.id;
  const dt   = new Date(msg.created_at);
  const time = dt.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });
  const date = dt.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'2-digit' });
  const div  = document.createElement('div');
  div.className = `chat-msg ${isMe ? 'mine' : ''}`;
  div.innerHTML = `
    <div class="chat-bubble">${esc(msg.text)}</div>
    <div class="chat-meta">${esc(msg.username)} · ${date}, ${time}</div>`;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

/* ----------------------------------------------------------
   Poll edit modal logic
   ---------------------------------------------------------- */

function _attachPollEditModal(poll) {
  const overlay = document.getElementById('poll-edit-overlay');
  if (!overlay) return;

  const isYearly = poll.poll_type === 'yearly';
  let nextOptId  = poll.options.length + 1;

  const closeModal = () => overlay.remove();

  /* Close on overlay background click */
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

  /* Cancel */
  document.getElementById('poll-edit-cancel')?.addEventListener('click', closeModal);

  /* Add option */
  document.getElementById('poll-edit-add-opt')?.addEventListener('click', () => {
    const list = document.getElementById('poll-edit-options');
    const row  = document.createElement('div');
    row.className = 'poll-option-row';
    row.dataset.optId = String(nextOptId++);
    row.innerHTML = `
      <input type="text" class="poll-edit-opt-text" placeholder="Neue Option" />
      ${isYearly ? `<span class="poll-option-dates" style="display:inline-flex">
        <input type="date" class="poll-edit-date-start" style="width:130px" />
        <span style="color:var(--muted);font-size:12px">–</span>
        <input type="date" class="poll-edit-date-end" style="width:130px" />
      </span>` : ''}
      <button class="btn btn-ghost btn-sm poll-edit-remove-opt" style="color:var(--danger);flex-shrink:0">✕</button>`;
    list?.appendChild(row);
    _bindRemoveOpts();
    row.querySelector('.poll-edit-opt-text')?.focus();
  });

  _bindRemoveOpts();

  /* Save */
  document.getElementById('poll-edit-save')?.addEventListener('click', async () => {
    const question = (document.getElementById('poll-edit-question')?.value || '').trim();
    if (!question) { toast('Frage eingeben.', 'error'); return; }

    const rows = [...document.querySelectorAll('#poll-edit-options .poll-option-row')];
    const options = rows.map((r, i) => {
      const text = r.querySelector('.poll-edit-opt-text')?.value.trim();
      if (!text) return null;
      const opt = { id: r.dataset.optId || String(i + 1), text };
      if (isYearly) {
        opt.date_start = r.querySelector('.poll-edit-date-start')?.value || null;
        opt.date_end   = r.querySelector('.poll-edit-date-end')?.value   || null;
      }
      return opt;
    }).filter(Boolean);

    if (options.length < 2) { toast('Mindestens 2 Optionen.', 'error'); return; }

    const multi = document.getElementById('poll-edit-multi')?.checked || false;

    try {
      await updatePoll(poll.id, question, options, multi);
      toast('✓ Abfrage aktualisiert');
      closeModal();
      const tc = document.getElementById('plan-tab-content');
      if (tc) { tc.innerHTML = renderPlanPolls(); attachPlanningContentEvents(); }
    } catch (e) { toast(e.message, 'error'); }
  });
}

function _bindRemoveOpts() {
  document.querySelectorAll('.poll-edit-remove-opt').forEach(btn => {
    if (btn._bound) return; btn._bound = true;
    btn.addEventListener('click', () => {
      const rows = document.querySelectorAll('#poll-edit-options .poll-option-row');
      if (rows.length <= 2) { toast('Mindestens 2 Optionen nötig.', 'error'); return; }
      btn.closest('.poll-option-row')?.remove();
    });
  });
}
