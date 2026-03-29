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
  document.getElementById('logout-btn')?.addEventListener('click', doLogout);

  /* --- Generic "back" buttons --- */
  document.querySelectorAll('#back-home').forEach(el => {
    el.addEventListener('click', () => navigateTo('home'));
  });

  /* --- Home buttons --- */
  document.getElementById('go-create')?.addEventListener('click', () => navigateTo('create'));
  document.getElementById('go-join')?.addEventListener('click',   () => navigateTo('join'));

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

  /* --- Tour tabs --- */
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      state.currentTab = btn.dataset.tab;
      if (state.currentTab === 'chat') await loadMessages();

      document.querySelectorAll('.tab-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.tab === state.currentTab)
      );

      const tc = document.getElementById('tab-content');
      if (tc && state.currentTour) {
        tc.innerHTML = renderTab(state.currentTour);
        afterTabRender();
      }
    });
  });

  /* --- Initial tab setup (on tour page) --- */
  if (state.view === 'tour') afterTabRender();
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
  }
  if (state.currentTab === 'info') {
    attachInfoEvents();
  }
}

/* ----------------------------------------------------------
   Map tab events
   ---------------------------------------------------------- */

function attachMapEvents() {
  /* GPX upload (admin only) */
  document.getElementById('gpx-up')?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;

    const text = await file.text();
    const data = parseGPX(text);  // returns { tracks, waypoints }

    const totalPts = data.tracks.reduce((s, t) => s + t.points.length, 0);
    if (!totalPts && !data.waypoints.length) {
      toast('Keine Route oder Wegpunkte in GPX-Datei gefunden.', 'error'); return;
    }

    try {
      await saveGPX(data);

      // Auto-calculate and persist distance from track data
      const dist = calculateTotalDistance(data);
      if (dist) {
        await updateTourInfo({ distance: dist });
        const hd = document.getElementById('hdr-dist'); if (hd) hd.textContent = '📏 ' + dist;
      }

      const summary = [
        data.tracks.length    ? `${data.tracks.length} Track${data.tracks.length !== 1 ? 's' : ''}` : '',
        data.waypoints.length ? `${data.waypoints.length} Wegpunkt${data.waypoints.length !== 1 ? 'e' : ''}` : '',
        dist                  ? dist : '',
      ].filter(Boolean).join(' · ');
      toast(`✓ Gespeichert: ${summary}`);
      _refreshMapTab();
    } catch (e) { toast(e.message, 'error'); }
  });

  /* GPX download */
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
   Chat tab events
   ---------------------------------------------------------- */

function attachChatEvents() {
  const doSend = async () => {
    const input = document.getElementById('chat-in');
    const text  = (input?.value || '').trim();
    if (!text) return;

    input.value = '';
    try {
      const msg = await sendMessage(text);
      state.tourMessages.push(msg);
      const tc = document.getElementById('tab-content');
      if (tc) {
        tc.innerHTML = renderTab(state.currentTour);
        attachChatEvents();
        setTimeout(() => {
          const el = document.getElementById('chat-msgs');
          if (el) el.scrollTop = el.scrollHeight;
        }, 30);
      }
    } catch (e) {
      toast(e.message, 'error');
      input.value = text; // restore on failure
    }
  };

  document.getElementById('chat-send')?.addEventListener('click', doSend);
  document.getElementById('chat-in')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') doSend();
  });
}

/* ----------------------------------------------------------
   Info tab events
   ---------------------------------------------------------- */

function attachInfoEvents() {
  /* Save edits */
  document.getElementById('edit-save')?.addEventListener('click', async () => {
    const updates = {
      destination: (document.getElementById('edit-dest')?.value || '').trim(),
      description: (document.getElementById('edit-desc')?.value || '').trim(),
    };
    try {
      await updateTourInfo(updates);
      toast('✓ Gespeichert');
      const hd = document.getElementById('hdr-dest'); if (hd) hd.textContent = '📍 ' + (updates.destination || 'Kein Ziel');
      const id = document.getElementById('info-dest'); if (id) id.textContent = updates.destination || '—';
    } catch (e) { toast(e.message, 'error'); }
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
