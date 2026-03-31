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
  document.getElementById('nav-logo')?.addEventListener('click', () => navigateTo('home'));
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
    el.addEventListener('click', () => navigateTo('home'));
  });

  /* --- Home buttons --- */
  document.getElementById('go-create')?.addEventListener('click', () => navigateTo('create'));
  document.getElementById('go-join')?.addEventListener('click',   () => navigateTo('join'));

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
    const pw    =  document.getElementById('f-pw')?.value    || '';

    if (!name)           { toast('Tour-Name ist Pflichtfeld.', 'error'); return; }
    if (!date)           { toast('Startdatum ist Pflichtfeld.', 'error'); return; }
    if (!pw || pw.length < 3) { toast('Passwort muss mindestens 3 Zeichen haben.', 'error'); return; }

    setBtn('create-submit', true);
    try {
      const t = await createTour({
        name, description: desc, date,
        end_date: edate || null,
        destination: dest,
        distance: '',
        join_password: pw,
      });
      state.myTourIds.add(t.id);
      toast('✓ Tour erstellt!');
      await navigateTo('tour', { currentTourId: t.id, currentTab: 'map' });
    } catch (e) {
      toast(e.message, 'error');
      setBtn('create-submit', false, 'Tour anlegen →');
    }
  });

  /* --- Join tour form --- */
  document.getElementById('join-submit')?.addEventListener('click', async () => {
    const id = document.getElementById('join-sel')?.value || '';
    const pw = document.getElementById('join-pw')?.value  || '';

    if (!id) { toast('Bitte eine Tour auswählen.', 'error'); return; }

    setBtn('join-submit', true);
    try {
      await joinTour(id, pw);
      toast('✓ Willkommen in der Tour! 🏍️');
      await navigateTo('tour', { currentTourId: id, currentTab: 'map' });
    } catch (e) {
      toast(e.message, 'error');
      setBtn('join-submit', false, 'Beitreten →');
    }
  });

  /* --- Participants: promote / demote --- */
  attachParticipantEvents();

  /* --- Tour tabs --- */
  document.querySelectorAll('.tab-btn').forEach(btn => {
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
}

/* ----------------------------------------------------------
   Map tab events
   ---------------------------------------------------------- */

function attachMapEvents() {
  /* Fullscreen toggle */
  document.getElementById('map-fullscreen')?.addEventListener('click', () => {
    const container = document.getElementById('map-container');
    if (!container) return;

    const isFs = document.fullscreenElement === container;
    if (!isFs) {
      container.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  });

  // Update icon + label when fullscreen state changes
  document.getElementById('map-container')?.addEventListener('fullscreenchange', () => {
    const isFs = !!document.fullscreenElement;
    const icon  = document.getElementById('map-fs-icon');
    const label = document.getElementById('map-fs-label');
    if (icon)  icon.textContent  = isFs ? '✕' : '⛶';
    if (label) label.textContent = isFs ? 'Vollbild beenden' : 'Vollbild';
    // Leaflet needs a size update after fullscreen change
    setTimeout(() => mapInstance?.invalidateSize(), 200);
  });

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
      await navigateTo('home');
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
      await navigateTo('home');
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
