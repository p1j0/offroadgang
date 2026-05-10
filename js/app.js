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
    if (state.currentUser && navigator.onLine) {
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

/**
 * Leert alle SW-Cache-Einträge für eine Supabase-Tabelle.
 * Wird vor einem frischen Tour-Fetch aufgerufen, damit veraltete Daten
 * nicht angezeigt werden. Gibt ein Promise zurück, das aufgelöst wird
 * sobald der SW den Cache geleert hat (oder sofort wenn kein SW aktiv).
 */
function _invalidateSWTable(table) {
  return new Promise(resolve => {
    if (!navigator.serviceWorker?.controller) { resolve(); return; }
    const mc = new MessageChannel();
    mc.port1.onmessage = () => resolve();
    navigator.serviceWorker.controller.postMessage(
      { type: 'INVALIDATE_TABLE', table },
      [mc.port2]
    );
    // Fallback: nach 300ms auflösen, falls SW nicht antwortet
    setTimeout(resolve, 300);
  });
}

async function _loadViewData(view) {
  if (view === 'communities' && state.currentUser) {
    await loadCommunities();
    state.isSiteAdminUser = await isSiteAdmin();
  }

  if ((view === 'community-home' || view === 'planning' || view === 'community-media') && state.currentCommunityId) {
    await loadCommunityData(state.currentCommunityId);

    if (view === 'community-home') {
      await loadHomeData();
      // Determine next upcoming tour (needed for checkins + plan dates)
      const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
      const nextTour = (state.tours || [])
        .filter(t => new Date((t.end_date || t.date) + 'T23:59:59') >= todayMidnight)
        .sort((a,b) => new Date(a.date) - new Date(b.date))[0];
      // Run all remaining fetches in parallel — none depend on each other
      await Promise.all([
        computePlanningBadges(),
        computeMediaBadges(),
        nextTour
          ? loadTourCheckins(nextTour.id).then(r => { state.tourCheckins[nextTour.id] = r; })
          : Promise.resolve(),
        nextTour
          ? loadNextTourPlanDates(nextTour.id)
          : Promise.resolve(),
      ]);
    }

    if (view === 'community-media') {
      // loadHomeData (tours list) and loadCommunityMedia are independent → parallel
      await Promise.all([loadHomeData(), loadCommunityMedia()]);
      await computeTourMediaCounts(); // needs state.tours from loadHomeData
      state.selectedTourMedia = null;
      markTabSeen(state.currentCommunityId, 'community-media');
      markTabSeen(state.currentCommunityId, 'tour-media');
      state.mediaBadges = { community: 0, tours: 0 };
    }

    if (view === 'planning') {
      await loadPlanningData();
      if (state.planningTab === 'map') await loadPlanningMapRoutes();
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
}

async function navigateTo(view, params = {}) {
  // Guard against concurrent calls (double-click, stacked event listeners, etc.)
  if (_navigating) return;
  _navigating = true;

  try {
    // Offline-Pre-Check: Wenn wir offline sind und auf eine Tour navigieren
    // wollen, die nicht im persistierten State ist, gibt es keine Möglichkeit
    // sie zu laden. Toast statt User in eine "Tour nicht gefunden"-Sackgasse
    // navigieren zu lassen.
    if (view === 'tour' && !navigator.onLine) {
      const targetTourId = params.currentTourId || state.currentTourId;
      if (targetTourId && state.currentTour?.id !== targetTourId) {
        if (typeof toast === 'function') toast('Diese Tour ist offline nicht verfügbar', 'error');
        _navigating = false;
        return;
      }
    }

    // Tear down map when leaving the tour detail page
    if (mapInstance && view !== 'tour') destroyMap();
    // Tear down overview mini-map when leaving tour
    if (view !== 'tour' && window._tovMapInstance) {
      try { window._tovMapInstance.remove(); } catch(e) {}
      window._tovMapInstance = null;
    }

    // Tear down realtime when leaving a tour
    if (view !== 'tour') {
      unsubscribeFromChat();
      state.infoBannerItems = [];
    }

    // Unsubscribe from community chat when leaving planning page
    if (view !== 'planning') unsubscribeFromCommunityChat();

    // Destroy plan map when leaving planning page
    if (view !== 'planning' && typeof _planMapInstance !== 'undefined' && _planMapInstance) {
      try { _planMapInstance.stop(); _planMapInstance.remove(); } catch(e) {}
      _planMapInstance = null;
      _planMapLayers   = [];
    }

    // Snapshot vor State-Änderung — nötig für Revert wenn loadViewData transient
    // fehlschlägt (iOS-Sockets nach Flugmodus, Timeout etc.). Ohne Revert würde
    // der User auf einer kaputten Tour-View landen mit currentTourId der neuen
    // Tour aber currentTour == null → "Tour nicht gefunden".
    const _navSnapshot = {
      view:               state.view,
      currentTourId:      state.currentTourId,
      currentTour:        state.currentTour,
      currentCommunityId: state.currentCommunityId,
      currentCommunity:   state.currentCommunity,
    };

    // Merge any extra params into global state
    Object.assign(state, params);

    // ─── STALE-WHILE-REVALIDATE ─────────────────────────────────────
    // Wenn State schon Daten für diese View hat:
    //   Online  → sofort mit alten Daten rendern, dann im Hintergrund
    //             nachladen und still neu rendern (kein sichtbares Warten)
    //   Offline → sofort rendern und fertig (kein Netzwerk-Roundtrip)
    const _isOffline = !navigator.onLine;
    const _hasCommData = (state.communities?.length || 0) > 0;
    const _hasHomeData = (state.tours?.length || 0) > 0 && state._loadedHomeForCid === state.currentCommunityId;
    const _hasPlanningData = (state.communityPolls?.length || state.communityMessages?.length || state.communityChangelog?.length || state.tours?.length)
      && state._loadedPlanningForCid === state.currentCommunityId;
    const _hasTourData = state.currentTour?.id === state.currentTourId;
    const _canRenderNow = (
      (view === 'communities'    && _hasCommData) ||
      (view === 'community-home' && _hasHomeData) ||
      (view === 'community-media'&& _hasHomeData) ||
      (view === 'planning'       && (_hasHomeData || _hasPlanningData)) ||
      (view === 'tour'           && _hasTourData)
    );

    if (_canRenderNow) {
      // Sofort mit vorhandenen Daten rendern → User sieht die Seite ohne Wartezeit
      state.view = view;
      render();
      if (_isOffline) return; // Offline: kein Netzwerk → fertig
      // Online: weiter unten werden Daten frisch geladen und danach
      //         erneut gerendert (Änderungen erscheinen still im Hintergrund)
    }

    // Load data required for the target view
    let transientLoadFailure = false;
    try {
      await _loadViewData(view);
    } catch (e) {
      console.error('[navigateTo] data fetch error:', e);
      if (e?.code === 'TRANSIENT_LOAD') {
        transientLoadFailure = true;
      }
    }

    // Bei transientem Load-Fehler (z.B. iOS-Socket-Glitch nach Flugmodus):
    // State-Snapshot zurückspielen, Toast zeigen, NICHT zur kaputten View
    // navigieren. Der User bleibt da wo er war und kann es erneut versuchen.
    if (transientLoadFailure) {
      Object.assign(state, _navSnapshot);
      if (typeof toast === 'function') toast('Verbindung instabil — bitte erneut versuchen', 'error');
      return;
    }

    // Nach dem Laden neu rendern — bei SWR ist dies der "stille" Update-Render.
    // Nur rendern wenn der User noch auf dieser View ist (nicht wegnavigiert).
    if (state.view === view || !_canRenderNow) {
      state.view = view;
      render();
      persistState();
    }
  } finally {
    _navigating = false;
  }
}

/* ----------------------------------------------------------
   Foreground refresh
   ---------------------------------------------------------- */

const FOREGROUND_REFRESH_MS = 60 * 1000;
let _foregroundRefreshTimer = null;
let _lastForegroundRefreshAt = 0;
let _foregroundRefreshRunning = false;

function _isInteractiveElementActive() {
  const el = document.activeElement;
  if (!el || el === document.body) return false;
  return !!el.closest('input, textarea, select, [contenteditable="true"]');
}

function _hasVisibleBlockingUi() {
  const selectors = [
    '.modal-overlay',
    '.tet-modal-overlay',
    '#media-lightbox',
    '#poll-edit-overlay',
    '#poll-create-form',
    '#media-yt-form',
    '#cm-yt-form',
    '#community-request-form',
  ];

  return selectors.some(selector => {
    return [...document.querySelectorAll(selector)].some(el => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && rect.width > 0
        && rect.height > 0;
    });
  });
}

function _canForegroundRefresh() {
  if (!state.currentUser || !navigator.onLine) return false;
  if (document.visibilityState && document.visibilityState !== 'visible') return false;
  if (_navigating || _foregroundRefreshRunning) return false;
  if (_isInteractiveElementActive() || _hasVisibleBlockingUi()) return false;
  // Map-Tabs werden NICHT mehr ausgeschlossen — wir wollen externe GPX-Updates
  // erkennen. Der full-Re-Render wird in refreshCurrentView gezielt unterdrückt
  // damit die Leaflet-Karte nicht zerlegt wird; stattdessen erscheint ein Toast.
  return ['communities', 'community-home', 'planning', 'community-media', 'tour'].includes(state.view);
}

function fitTourCardAvatars() {
  document.querySelectorAll('[data-tour-avatar-stack]').forEach(stack => {
    const actions = stack.closest('.tour-card-actions');
    const footer = stack.closest('.tour-card-footer');
    if (!actions || !footer) return;

    const items = [...stack.querySelectorAll('[data-tour-avatar-item]')];
    const more = stack.querySelector('[data-tour-avatar-more]');
    if (!items.length || !more) return;

    const footerStyle = getComputedStyle(footer);
    const footerContentWidth = footer.getBoundingClientRect().width
      - parseFloat(footerStyle.paddingLeft || 0)
      - parseFloat(footerStyle.paddingRight || 0);
    const actionsGap = parseFloat(getComputedStyle(actions).columnGap || getComputedStyle(actions).gap || 0) || 0;
    const minDateWidth = 78;
    const maxActionsWidth = Math.max(48, footerContentWidth - minDateWidth - actionsGap);

    const applyVisibleCount = (count) => {
      items.forEach((item, index) => {
        item.classList.toggle('tour-avatar-hidden', index >= count);
      });
      const hiddenCount = items.length - count;
      more.classList.toggle('tour-avatar-hidden', hiddenCount <= 0);
      more.textContent = hiddenCount > 0 ? `+${hiddenCount}` : '';
      more.title = hiddenCount > 0 ? `${hiddenCount} weitere Rider` : '';
    };

    const actionsWidthForCurrentState = () => {
      const visibleChildren = [...actions.children].filter(child => {
        if (child === stack) return true;
        return getComputedStyle(child).display !== 'none' && !child.classList.contains('tour-avatar-hidden');
      });
      const childWidth = visibleChildren.reduce((sum, child) => sum + child.getBoundingClientRect().width, 0);
      return childWidth + Math.max(0, visibleChildren.length - 1) * actionsGap;
    };

    for (let count = items.length; count >= 1; count--) {
      applyVisibleCount(count);
      if (actionsWidthForCurrentState() <= maxActionsWidth) return;
    }
    applyVisibleCount(1);
  });
}

async function refreshCurrentView({ force = false } = {}) {
  if (!_canForegroundRefresh()) return;
  const now = Date.now();
  if (!force && now - _lastForegroundRefreshAt < FOREGROUND_REFRESH_MS) return;

  _foregroundRefreshRunning = true;
  _lastForegroundRefreshAt = now;
  const view = state.view;
  const onTourMap = view === 'tour'    && state.currentTab === 'map';
  const onPlanMap = view === 'planning' && state.planningTab === 'map';
  const onMapTab  = onTourMap || onPlanMap;

  // Vor dem Refresh: Fingerprints merken um externe GPX-Updates zu erkennen.
  // _loadViewData ruft loadTourData/loadPlanningMapRoutes auf, die intern via
  // _preserveCachedRoute den Fingerprint vergleichen und state aktualisieren.
  const beforeTourFp = onTourMap
    ? (typeof _routeFingerprint === 'function' ? _routeFingerprint(state.currentTour?.route_metadata) : null)
    : null;
  const beforePlanFps = onPlanMap
    ? new Map((state.communityToursGpx || []).map(t => [
        t.id,
        typeof _routeFingerprint === 'function' ? _routeFingerprint(t.route_metadata) : ''
      ]))
    : null;

  // Snapshot der wichtigsten Listen-Längen, um nach dem Refresh zu erkennen ob
  // der Server-Roundtrip die Daten "verloren" hat (z.B. transienter Netzwerk-
  // fehler, JWT-Ablauf). In dem Fall: KEIN persistState, sonst überschreiben
  // wir die guten Daten in localStorage mit leeren Listen.
  const beforeCounts = {
    tours:             state.tours?.length             || 0,
    tourMessages:      state.tourMessages?.length      || 0,
    tourMembers:       state.tourMembers?.length       || 0,
    tourChangelog:     state.tourChangelog?.length     || 0,
    communityPolls:    state.communityPolls?.length    || 0,
    communityMessages: state.communityMessages?.length || 0,
    communityMembers:  state.communityMembers?.length  || 0,
    communityMedia:    state.communityMedia?.length    || 0,
  };

  try {
    await _loadViewData(view);
    if (state.view !== view || !_canForegroundRefresh()) return;

    // Hat der Refresh eine zuvor gefüllte Liste auf 0 reduziert? Das ist bei
    // einer einzelnen Aktion fast immer ein Symptom (transient), nicht das
    // legitime "alles wurde gelöscht"-Szenario. State behalten.
    const afterCounts = {
      tours:             state.tours?.length             || 0,
      tourMessages:      state.tourMessages?.length      || 0,
      tourMembers:       state.tourMembers?.length       || 0,
      tourChangelog:     state.tourChangelog?.length     || 0,
      communityPolls:    state.communityPolls?.length    || 0,
      communityMessages: state.communityMessages?.length || 0,
      communityMembers:  state.communityMembers?.length  || 0,
      communityMedia:    state.communityMedia?.length    || 0,
    };
    const dataLost = Object.keys(beforeCounts).some(
      k => beforeCounts[k] > 0 && afterCounts[k] === 0
    );
    if (dataLost) {
      console.warn('[refreshCurrentView] data shrunk to empty — likely transient, skipping render+persist', { beforeCounts, afterCounts });
      return; // weder Render noch Persist
    }

    if (onMapTab) {
      // Auf dem Map-Tab: KEIN render() — sonst zerlegen wir die Leaflet-Karte
      // mitten in der User-Interaktion. Stattdessen Toast wenn GPX-Daten extern
      // aktualisiert wurden; die Karte zeigt weiter den alten Stand bis der User
      // den Tab neu öffnet (dann initMap mit frischem state.currentTour.gpx_route=null
      // → Preview, beim Zoom-Klick voller GPX vom Server).
      let staleDetected = false;
      if (onTourMap) {
        const afterFp = _routeFingerprint(state.currentTour?.route_metadata);
        if (beforeTourFp && afterFp && beforeTourFp !== afterFp) staleDetected = true;
      } else if (onPlanMap) {
        for (const t of (state.communityToursGpx || [])) {
          const before = beforePlanFps.get(t.id);
          const after  = _routeFingerprint(t.route_metadata);
          if (before && after && before !== after) { staleDetected = true; break; }
        }
      }
      if (staleDetected && typeof toast === 'function') {
        toast('Route wurde aktualisiert — Karte neu öffnen für die neue Version');
      }
      persistState();
      return;
    }

    render();
    persistState();
  } catch (e) {
    console.warn('[foreground refresh]', e);
  } finally {
    _foregroundRefreshRunning = false;
  }
}

function startForegroundRefresh() {
  if (_foregroundRefreshTimer) return;

  _foregroundRefreshTimer = setInterval(() => {
    refreshCurrentView();
  }, FOREGROUND_REFRESH_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshCurrentView({ force: true });
  });
  window.addEventListener('online', _scheduleOnlineReload);
  window.addEventListener('focus', () => refreshCurrentView({ force: true }));
}

/**
 * Beim Online-Wiederkehr macht die App einen vollen Page-Reload anstatt
 * Tiles/State manuell zu reparieren. Grund: iOS Safari behält nach Flugmodus
 * gerne kaputte Network-Sockets — `navigator.onLine` sagt true, aber Fetches
 * scheitern weiter, bis der Tab neu geladen wird. Ein Reload löst das
 * zuverlässig.
 *
 * Guards:
 *  - Nicht reloaden wenn User gerade tippt (Input/Textarea aktiv)
 *  - Nicht reloaden wenn ein Modal offen ist (würde Form-State verlieren)
 *  - Nur einmal pro Session pro online-Übergang
 *  - Nicht reloaden wenn wir uns gar nicht erinnern offline gewesen zu sein
 *    (mancher Browser feuert online auch direkt nach App-Start)
 */
let _wasOffline = !navigator.onLine;
let _onlineReloadScheduled = false;
function _scheduleOnlineReload() {
  if (!_wasOffline) return; // war nie offline → nichts zu tun
  if (_onlineReloadScheduled) return;
  _onlineReloadScheduled = true;

  const tryReload = () => {
    // Guards: User nicht beim Tippen / mit offenem Modal stören
    if (_isInteractiveElementActive() || _hasVisibleBlockingUi()) {
      // 5s später erneut versuchen
      setTimeout(tryReload, 5000);
      return;
    }
    if (typeof toast === 'function') toast('Verbindung wiederhergestellt — lade neu…');
    setTimeout(() => location.reload(), 600);
  };

  // Kurzer Delay damit iOS-Socket sich beruhigt + Toast-Zeit
  setTimeout(tryReload, 800);
}
window.addEventListener('offline', () => {
  _wasOffline = true;
  _onlineReloadScheduled = false;
});

/**
 * Forciere TileLayer-Redraw auf allen aktiven Leaflet-Maps. Wird beim Online-
 * Comeback aufgerufen — ohne das bleiben offline geladene leere PNGs für
 * immer in der View hängen.
 */
function _redrawAllMapTiles() {
  const maps = [];
  if (typeof mapInstance !== 'undefined' && mapInstance) maps.push(mapInstance);
  if (typeof window !== 'undefined' && window._tovMapInstance) maps.push(window._tovMapInstance);
  if (typeof _planMapInstance !== 'undefined' && _planMapInstance) maps.push(_planMapInstance);
  for (const m of maps) {
    try {
      m.eachLayer(layer => {
        if (layer instanceof L.TileLayer && typeof layer.redraw === 'function') {
          layer.redraw();
        }
      });
    } catch (e) { /* non-fatal */ }
  }
}

async function hydrateCurrentTourGpxFromCache() {
  const tour = state.currentTour;
  if (!tour?.id || tour.gpx_route || typeof gpxCacheGet !== 'function') return;
  try {
    const cached = await gpxCacheGet(tour.id, tour.route_metadata);
    if (cached && state.currentTour?.id === tour.id) {
      state.currentTour.gpx_route = cached;
    }
  } catch (e) {
    console.warn('[offline gpx hydrate]', e);
  }
}

/* ----------------------------------------------------------
   Render dispatcher
   ---------------------------------------------------------- */

let _renderGeneration = 0;
let _siteChangelogPopupTimer = null;

/**
 * Re-render the entire #app element based on state.view.
 * After injecting HTML, wire up event listeners.
 */
function render() {
  const app = document.getElementById('app');
  if (!app) return;
  const renderGeneration = ++_renderGeneration;

  const showNav = !['auth', 'loading', 'forgot-password', 'reset-password'].includes(state.view);

  try {
    let html = showNav ? renderNav() : '';

    switch (state.view) {
      case 'auth':                html += renderAuth();             break;
      case 'forgot-password':     html += renderForgotPassword();   break;
      case 'reset-password':      html += renderResetPassword();    break;
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

    // A full app render replaces modal DOM. If a modal was open during a
    // background/SWR re-render, clear its scroll lock so the page remains usable.
    document.body.style.overflow = '';
    app.innerHTML = html;
    attachEvents();
    syncStickyLayout();
    requestAnimationFrame(fitTourCardAvatars);
    if (typeof maybeOpenSiteChangelogPopup === 'function') {
      if (_siteChangelogPopupTimer) clearTimeout(_siteChangelogPopupTimer);
      _siteChangelogPopupTimer = setTimeout(() => {
        if (renderGeneration === _renderGeneration) maybeOpenSiteChangelogPopup();
      }, 1800);
    }
  } catch (e) {
    console.error('[render] error:', e);
    app.innerHTML = `<div style="padding:40px;color:#e04444;font-family:monospace">
      <strong>Render-Fehler:</strong><br>${e.message}<br><br>
      <button onclick="location.reload()" style="padding:8px 16px;cursor:pointer">Seite neu laden</button>
    </div>`;
  }
}

window._setTourFilter = (f) => { state.tourFilter = f; render(); };

/* ----------------------------------------------------------
   Tour weather tab (Open-Meteo, per-user location choice)
   ---------------------------------------------------------- */

function _weatherChoiceKey(tourId) {
  return `mr_weather_location_${tourId}`;
}

function getStoredWeatherChoice(tourId) {
  try { return localStorage.getItem(_weatherChoiceKey(tourId)); }
  catch(e) { return null; }
}

function setStoredWeatherChoice(tourId, value) {
  try { localStorage.setItem(_weatherChoiceKey(tourId), value); }
  catch(e) {}
}

function getTourWeatherOptions(tour = state.currentTour) {
  const options = [];
  const meeting = (state.tourPlanDates || []).find(pd => pd.type === 'treffpunkt' && pd.maps_link);
  if (meeting) {
    const place = (meeting.label || '').trim();
    options.push({
      value: 'meeting',
      label: place ? `Treffpunkt - ${place}` : 'Treffpunkt',
      source: place ? `Treffpunkt - ${place}` : 'Treffpunkt',
      detail: meeting.label || meeting.date || '',
      mapsLink: meeting.maps_link,
    });
  }

  const routeMetadata = tour?.route_metadata || (typeof buildRouteMetadata === 'function' ? buildRouteMetadata(tour?.gpx_route) : null);
  (routeMetadata?.tracks || []).forEach((track, trackIndex) => {
    const routeTrackIndex = Number.isFinite(Number(track.index)) ? Number(track.index) : trackIndex;
    const trackName = track.name || `Track ${routeTrackIndex + 1}`;
    [
      ['start', 'Anfang'],
      ['middle', 'Mitte'],
      ['end', 'Ende'],
    ].forEach(([pos, label]) => {
      const point = track[pos];
      const lat = Number(point?.lat);
      const lon = Number(point?.lon ?? point?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      options.push({
        value: `track:${routeTrackIndex}:${pos}`,
        label: `${trackName} ${label}`,
        source: `${trackName} ${label}`,
        detail: trackName,
        trackIndex: routeTrackIndex,
        position: pos,
        latitude: lat,
        longitude: lon,
      });
    });
  });

  return options;
}

function getSelectedWeatherChoice(tour = state.currentTour) {
  const options = getTourWeatherOptions(tour);
  if (!options.length) return null;
  const stored = getStoredWeatherChoice(tour.id);
  return options.find(o => o.value === stored) || options[0];
}

function _trackPointAtFraction(points, fraction) {
  if (!points?.length) return null;
  if (fraction <= 0 || points.length === 1) return points[0];
  if (fraction >= 1) return points[points.length - 1];

  const distances = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = _haversine(points[i - 1], points[i]);
    distances.push(d);
    total += d;
  }
  if (!total) return points[Math.floor(points.length * fraction)] || points[0];

  const target = total * fraction;
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const segment = distances[i - 1];
    if (walked + segment >= target) {
      const ratio = segment ? (target - walked) / segment : 0;
      const a = points[i - 1];
      const b = points[i];
      return [
        a[0] + (b[0] - a[0]) * ratio,
        a[1] + (b[1] - a[1]) * ratio,
      ];
    }
    walked += segment;
  }
  return points[points.length - 1];
}

async function resolveTourWeatherChoice(choice, tour = state.currentTour) {
  if (!choice || !tour) return null;
  if (choice.value === 'meeting') {
    const coords = await _extractMapCoords(choice.mapsLink);
    return coords ? { ...coords, label: choice.label, source: choice.source } : null;
  }

  const directLat = Number(choice.latitude);
  const directLon = Number(choice.longitude);
  if (Number.isFinite(directLat) && Number.isFinite(directLon)) {
    return {
      latitude: directLat,
      longitude: directLon,
      label: choice.label,
      source: choice.source,
    };
  }

  const match = choice.value.match(/^track:(\d+):(start|middle|end)$/);
  if (!match) return null;
  const trackIndex = Number(match[1]);
  const routeMetadata = tour.route_metadata || (typeof buildRouteMetadata === 'function' ? buildRouteMetadata(tour.gpx_route) : null);
  const metaTrack = (routeMetadata?.tracks || []).find(t => Number(t.index) === trackIndex);
  const metaPoint = metaTrack?.[match[2]];
  const metaLat = Number(metaPoint?.lat);
  const metaLon = Number(metaPoint?.lon ?? metaPoint?.lng);
  if (Number.isFinite(metaLat) && Number.isFinite(metaLon)) {
    return { latitude: metaLat, longitude: metaLon, label: choice.label, source: choice.source };
  }

  const gpx = normalizeGPXRoute(tour.gpx_route);
  const points = (gpx?.tracks?.[trackIndex]?.points || []).filter(p => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1]));
  const fraction = match[2] === 'middle' ? 0.5 : match[2] === 'end' ? 1 : 0;
  const point = typeof routePointAtFraction === 'function'
    ? routePointAtFraction(points, fraction)
    : _trackPointAtFraction(points, fraction);
  return point ? {
    latitude: Array.isArray(point) ? point[0] : point.lat,
    longitude: Array.isArray(point) ? point[1] : point.lon,
    label: choice.label,
    source: choice.source,
  } : null;
}

async function loadTourWeatherTab() {
  const tour = state.currentTour;
  const root = document.getElementById('tour-weather-body');
  if (!tour || !root) return;

  const choices = getTourWeatherOptions(tour);
  const choice = getSelectedWeatherChoice(tour);
  if (!choices.length || !choice) {
    root.innerHTML = '<div class="weather-empty">Keine Wetterposition verfügbar. Lege einen Treffpunkt mit Maps-Link an oder lade eine GPX-Route hoch.</div>';
    return;
  }

  root.innerHTML = '<div class="weather-loading">Wetter wird geladen…</div>';
  try {
    const resolved = await resolveTourWeatherChoice(choice, tour);
    if (!resolved) {
      root.innerHTML = '<div class="weather-empty">Position konnte nicht bestimmt werden.</div>';
      return;
    }

    const startDate = tour.date;
    const endDate = tour.end_date || tour.date;
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 15);
    const maxDateStr = maxDate.toISOString().slice(0, 10);
    const clampedEnd = endDate > maxDateStr ? maxDateStr : endDate;

    const resp = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${resolved.latitude}&longitude=${resolved.longitude}&daily=weathercode,temperature_2m_max,temperature_2m_min&hourly=precipitation,precipitation_probability&timezone=auto&start_date=${startDate}&end_date=${clampedEnd}`,
      { cache: 'no-store' }
    );
    const [data, wetnessRows] = await Promise.all([
      resp.json(),
      loadAllOffroadWetness(choices, tour),
    ]);
    const daily = data.daily || {};
    const segmentsByDay = _weatherSegmentsByDay(data.hourly);
    const forecastRows = _renderWeatherForecastRows(daily, segmentsByDay);
    const coords = `${resolved.latitude.toFixed(5)}, ${resolved.longitude.toFixed(5)}`;

    root.innerHTML = `
      ${renderOffroadWetnessList(wetnessRows)}
      <div class="tour-weather-location">
        <span>${esc(resolved.source || choice.label)}</span>
        <span>${coords}</span>
      </div>
      <div class="tour-weather-grid">${forecastRows || '<div class="weather-empty">Keine Vorhersage für diesen Zeitraum verfügbar.</div>'}</div>
      ${endDate > maxDateStr ? '<div class="checkin-weather-hint">Vorhersage max. 16 Tage im Voraus verfügbar</div>' : ''}`;
  } catch (e) {
    console.warn('[tour weather]', e);
    root.innerHTML = '<div class="weather-empty">Wetter konnte nicht geladen werden.</div>';
  }
}

async function loadOverviewWeatherCard() {
  const tour = state.currentTour;
  const el = document.getElementById(`tov-weather-${tour?.id}`);
  if (!tour || !el) return;

  const choice = getSelectedWeatherChoice(tour);
  if (!choice) {
    el.innerHTML = '<div class="tov-empty-hint">Kein Wetterpunkt verfügbar</div>';
    return;
  }

  try {
    const resolved = await resolveTourWeatherChoice(choice, tour);
    if (!resolved) {
      el.innerHTML = '<div class="tov-empty-hint">Position nicht verfügbar</div>';
      return;
    }

    const endDate = tour.end_date || tour.date;
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 15);
    const maxDateStr = maxDate.toISOString().slice(0, 10);
    if (tour.date > maxDateStr) {
      el.innerHTML = renderOverviewWeatherNA(
        resolved.source || choice.label,
        'Vorhersage max. 16 Tage im Voraus verfügbar'
      );
      return;
    }

    const clampedEnd = endDate > maxDateStr ? maxDateStr : endDate;
    const resp = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${resolved.latitude}&longitude=${resolved.longitude}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum&timezone=auto&start_date=${tour.date}&end_date=${clampedEnd}`,
      { cache: 'no-store' }
    );
    const [data, wetness] = await Promise.all([
      resp.json(),
      loadOffroadWetness(resolved.latitude, resolved.longitude),
    ]);

    const daily = data.daily || {};
    const idx = 0;
    const hasForecast = daily.time?.[idx]
      && Number.isFinite(Number(daily.temperature_2m_max?.[idx]))
      && Number.isFinite(Number(daily.temperature_2m_min?.[idx]));
    if (!hasForecast) {
      el.innerHTML = renderOverviewWeatherNA(
        resolved.source || choice.label,
        'Keine Vorhersagedaten für diesen Zeitraum verfügbar'
      );
      return;
    }

    const icon = _weatherIcon(daily.weathercode?.[idx]);
    const max = Math.round(Number(daily.temperature_2m_max[idx]));
    const min = Math.round(Number(daily.temperature_2m_min[idx]));
    const probRaw = Number(daily.precipitation_probability_max?.[idx]);
    const rainRaw = Number(daily.precipitation_sum?.[idx]);
    const prob = Number.isFinite(probRaw) ? Math.round(probRaw) : 'N/A';
    const rain = Number.isFinite(rainRaw)
      ? rainRaw.toLocaleString('de-DE', { maximumFractionDigits: 1 }) + 'mm'
      : 'N/A';
    const wetTotal = wetness.total.toLocaleString('de-DE', { maximumFractionDigits: 1 });
    const wetMax = wetness.maxHour.toLocaleString('de-DE', { maximumFractionDigits: 1 });

    el.innerHTML = `
      <div class="tov-weather-location">${esc(resolved.source || choice.label)}</div>
      <div class="tov-weather-main">
        <span class="tov-weather-icon">${icon}</span>
        <span class="tov-weather-temp">${min}° / ${max}°</span>
      </div>
      <div class="tov-weather-rain">🌧 ${prob}${prob === 'N/A' ? '' : '%'} · ${rain}</div>
      <div class="tov-weather-index offroad-wetness-${wetness.level}">
        <strong>${wetness.label}</strong>
        <span>48h ${wetTotal}mm · max/h ${wetMax}mm/h</span>
      </div>`;
  } catch (e) {
    console.warn('[overview weather]', e);
    el.innerHTML = '<div class="tov-empty-hint">Wetter nicht verfügbar</div>';
  }
}

function renderOverviewWeatherNA(location, hint) {
  return `
    <div class="tov-weather-location">${esc(location || 'Wetterpunkt')}</div>
    <div class="tov-weather-na">N/A</div>
    <div class="tov-weather-na-hint">${esc(hint || 'Wetterdaten nicht verfügbar')}</div>`;
}

function _renderWeatherForecastRows(daily = {}, segmentsByDay = {}) {
  return (daily.time || []).map((date, idx) => {
    const dt = new Date(`${date}T12:00:00`);
    const label = dt.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
    const icon = _weatherIcon(daily.weathercode?.[idx]);
    const max = Math.round(daily.temperature_2m_max?.[idx] ?? 0);
    const min = Math.round(daily.temperature_2m_min?.[idx] ?? 0);
    const segments = segmentsByDay[date] || _emptyWeatherSegments();
    const segmentRows = segments.map(s => {
      const rain = Number(s.precip || 0).toLocaleString('de-DE', { maximumFractionDigits: 1 });
      return `<div class="tour-weather-segment">
        <span>${s.label}</span>
        <span>🌧 ${Math.round(s.prob || 0)}%</span>
        <span>${rain}mm/h</span>
      </div>`;
    }).join('');
    return `
      <div class="tour-weather-day">
        <div class="tour-weather-date">${label}</div>
        <div class="tour-weather-icon">${icon}</div>
        <div class="tour-weather-temp">${min}° / ${max}°</div>
        <div class="tour-weather-segments">${segmentRows}</div>
      </div>`;
  }).join('');
}

function _weatherIcon(code) {
  if (code === 0) return '☀️';
  if (code <= 2) return '⛅';
  if (code <= 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌧️';
  if (code <= 86) return '❄️';
  return '⚡';
}

function _emptyWeatherSegments() {
  return [
    { key: 'morning', label: 'VM', prob: 0, precip: 0 },
    { key: 'midday',  label: 'MI', prob: 0, precip: 0 },
    { key: 'evening', label: 'AB', prob: 0, precip: 0 },
  ];
}

function _weatherSegmentsByDay(hourly = {}) {
  const result = {};
  (hourly.time || []).forEach((time, idx) => {
    const day = String(time).slice(0, 10);
    const hour = Number(String(time).slice(11, 13));
    const segmentIndex = hour >= 6 && hour < 12 ? 0
      : hour >= 12 && hour < 18 ? 1
      : hour >= 18 && hour < 24 ? 2
      : -1;
    if (segmentIndex < 0) return;
    if (!result[day]) result[day] = _emptyWeatherSegments();
    const segment = result[day][segmentIndex];
    segment.prob = Math.max(segment.prob, Number(hourly.precipitation_probability?.[idx] || 0));
    segment.precip = Math.max(segment.precip, Number(hourly.precipitation?.[idx] || 0));
  });
  return result;
}

async function loadOffroadWetness(latitude, longitude) {
  const resp = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=precipitation&past_hours=48&forecast_hours=1&timezone=auto`,
    { cache: 'no-store' }
  );
  const data = await resp.json();
  const values = (data.hourly?.precipitation || []).map(v => Number(v || 0));
  const total = values.reduce((sum, v) => sum + v, 0);
  const maxHour = values.reduce((max, v) => Math.max(max, v), 0);

  let level = 'dry';
  let label = 'trocken';
  if (total >= 25 || maxHour >= 8) {
    level = 'heavy';
    label = 'sehr nass';
  } else if (total >= 10 || maxHour >= 4) {
    level = 'wet';
    label = 'nass';
  } else if (total >= 2 || maxHour >= 1) {
    level = 'damp';
    label = 'feucht';
  }

  return { total, maxHour, level, label };
}

async function loadAllOffroadWetness(choices, tour) {
  return Promise.all(choices.map(async choice => {
    const resolved = await resolveTourWeatherChoice(choice, tour);
    if (!resolved) return { choice, resolved: null, wetness: null };
    const wetness = await loadOffroadWetness(resolved.latitude, resolved.longitude);
    return { choice, resolved, wetness };
  }));
}

function renderOffroadWetnessList(rows) {
  if (!rows?.length) return '';
  const cells = rows.map(row => {
    if (!row.wetness) {
      return {
        className: 'offroad-wetness-missing',
        name: row.choice.label,
        score: '—',
        total: null,
        maxHour: null,
      };
    }
    const total = row.wetness.total.toLocaleString('de-DE', { maximumFractionDigits: 1 });
    const maxHour = row.wetness.maxHour.toLocaleString('de-DE', { maximumFractionDigits: 1 });
    return {
      className: `offroad-wetness-${row.wetness.level}`,
      name: row.resolved.source || row.choice.label,
      score: row.wetness.label,
      total,
      maxHour,
    };
  });

  return `<div class="offroad-wetness-matrix-wrap">
    <div class="offroad-wetness-matrix-title">OffRoad Regen-Index</div>
    <table class="offroad-wetness-matrix">
      <tbody>
        <tr class="offroad-wetness-matrix-names">
          ${cells.map(c => `<td class="${c.className}">${esc(c.name)}</td>`).join('')}
        </tr>
        <tr class="offroad-wetness-matrix-scores">
          ${cells.map(c => `<td class="${c.className}">${esc(c.score)}</td>`).join('')}
        </tr>
        <tr class="offroad-wetness-matrix-history">
          ${cells.map(c => `<td class="${c.className}">${c.total ? `<span>last 48h:</span><span>ges: ${esc(c.total)} mm</span><span>max/h: ${esc(c.maxHour)} mm/h</span>` : 'Position nicht verfügbar'}</td>`).join('')}
        </tr>
      </tbody>
    </table>
  </div>`;
}

function renderOffroadWetness(wetness) {
  if (!wetness) return '';
  const total = wetness.total.toLocaleString('de-DE', { maximumFractionDigits: 1 });
  const maxHour = wetness.maxHour.toLocaleString('de-DE', { maximumFractionDigits: 1 });
  return `<div class="offroad-wetness offroad-wetness-${wetness.level}">
    <div>
      <span class="offroad-wetness-label">Offroad-Nässe</span>
      <strong>${wetness.label}</strong>
    </div>
    <div class="offroad-wetness-meta">
      <span>48h ${total}mm</span>
      <span>max st. ${maxHour}mm/h</span>
    </div>
  </div>`;
}

async function openRainRadarModal() {
  const tour = state.currentTour;
  const choice = getSelectedWeatherChoice(tour);
  if (!tour || !choice) {
    toast('Keine Wetterposition verfügbar.', 'error');
    return;
  }

  document.getElementById('rain-radar-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'rain-radar-overlay';
  overlay.className = 'rain-radar-overlay';
  overlay.innerHTML = `
    <div class="rain-radar-modal">
      <div class="rain-radar-head">
        <div>
          <div class="rain-radar-title">Regenradar</div>
          <div class="rain-radar-sub" id="rain-radar-sub">Lädt…</div>
        </div>
        <button class="rain-radar-close" id="rain-radar-close" aria-label="Schließen">×</button>
      </div>
      <div class="rain-radar-map" id="rain-radar-map"></div>
      <div class="rain-radar-controls">
        <button class="rain-radar-step" id="rain-radar-prev" title="Zurück">‹</button>
        <button class="rain-radar-step" id="rain-radar-play" title="Animation starten">▶</button>
        <input type="range" id="rain-radar-range" min="0" max="0" value="0" />
        <button class="rain-radar-step" id="rain-radar-next" title="Vor">›</button>
      </div>
      <div class="rain-radar-foot">
        <span id="rain-radar-time"></span>
        <a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const close = () => {
    if (window._rainRadarTimer) clearInterval(window._rainRadarTimer);
    window._rainRadarTimer = null;
    try { window._rainRadarMap?.remove(); } catch(e) {}
    window._rainRadarMap = null;
    overlay.remove();
    document.body.style.overflow = '';
  };
  document.getElementById('rain-radar-close')?.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  try {
    const resolved = await resolveTourWeatherChoice(choice, tour);
    if (!resolved) throw new Error('Position konnte nicht bestimmt werden.');

    document.getElementById('rain-radar-sub').textContent =
      `${resolved.source || choice.label} · ${resolved.latitude.toFixed(5)}, ${resolved.longitude.toFixed(5)}`;

    const metaResp = await fetch('https://api.rainviewer.com/public/weather-maps.json', { cache: 'no-store' });
    const meta = await metaResp.json();
    const pastFrames = (meta.radar?.past || []).map(f => ({ ...f, kind: 'past' }));
    const nowcastFrames = (meta.radar?.nowcast || []).map(f => ({ ...f, kind: 'nowcast' }));
    const frames = [...pastFrames, ...nowcastFrames];
    if (!meta.host || !frames.length) throw new Error('Keine Radardaten verfügbar.');

    const map = L.map('rain-radar-map', {
      center: [resolved.latitude, resolved.longitude],
      zoom: 7,
      maxZoom: 7,
      minZoom: 3,
    });
    window._rainRadarMap = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      opacity: 0.9,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    const boundsPoints = [[resolved.latitude, resolved.longitude]];
    const gpxData = normalizeGPXRoute(tour.gpx_route)
      || (typeof routeMetadataToPreviewRoute === 'function' ? routeMetadataToPreviewRoute(tour.route_metadata) : null);
    (gpxData?.tracks || []).forEach((track, idx) => {
      const pts = (track.points || []).filter(p => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1]));
      if (!pts.length) return;
      L.polyline(pts.map(p => [p[0], p[1]]), {
        color: track.color || TRACK_COLORS[idx % TRACK_COLORS.length],
        weight: 4,
        opacity: 0.95,
      }).addTo(map);
      boundsPoints.push(...pts.map(p => [p[0], p[1]]));
    });

    L.marker([resolved.latitude, resolved.longitude]).addTo(map);

    const range = document.getElementById('rain-radar-range');
    const prevBtn = document.getElementById('rain-radar-prev');
    const nextBtn = document.getElementById('rain-radar-next');
    const playBtn = document.getElementById('rain-radar-play');
    let frameIndex = Math.max(0, pastFrames.length - 1);
    let radarLayer = null;

    range.max = String(frames.length - 1);

    const setFrame = (index) => {
      frameIndex = Math.max(0, Math.min(frames.length - 1, index));
      const frame = frames[frameIndex];
      if (radarLayer) map.removeLayer(radarLayer);
      radarLayer = L.tileLayer(`${meta.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`, {
        tileSize: 256,
        opacity: 0.72,
        maxZoom: 7,
        attribution: 'Radar: RainViewer',
      }).addTo(map);

      range.value = String(frameIndex);
      prevBtn.disabled = frameIndex === 0;
      nextBtn.disabled = frameIndex === frames.length - 1;
      const time = new Date(frame.time * 1000).toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
      const tag = frame.kind === 'nowcast' ? 'Nowcast' : 'Radar';
      document.getElementById('rain-radar-time').textContent = `${tag} ${time}`;
    };

    prevBtn.addEventListener('click', () => setFrame(frameIndex - 1));
    nextBtn.addEventListener('click', () => setFrame(frameIndex + 1));
    range.addEventListener('input', () => setFrame(Number(range.value)));
    playBtn.addEventListener('click', () => {
      if (window._rainRadarTimer) {
        clearInterval(window._rainRadarTimer);
        window._rainRadarTimer = null;
        playBtn.textContent = '▶';
        return;
      }
      playBtn.textContent = '⏸';
      window._rainRadarTimer = setInterval(() => {
        setFrame(frameIndex >= frames.length - 1 ? 0 : frameIndex + 1);
      }, 700);
    });

    setFrame(frameIndex);
    if (boundsPoints.length > 1) {
      map.fitBounds(L.latLngBounds(boundsPoints), { padding: [28, 28], maxZoom: 7 });
    }
    setTimeout(() => map.invalidateSize(), 80);
  } catch (e) {
    console.warn('[rain radar]', e);
    document.getElementById('rain-radar-sub').textContent = e.message || 'Radar konnte nicht geladen werden.';
    document.getElementById('rain-radar-map').innerHTML = '<div class="weather-empty">Regenradar konnte nicht geladen werden.</div>';
  }
}

/* ----------------------------------------------------------
   Check-in weather forecast (Open-Meteo, free, no API key)
   ---------------------------------------------------------- */

async function _extractMapCoords(url) {
  if (!url) return null;

  const parse = (u) => {
    let m = u.match(/@(-?\d+\.?\d+),(-?\d+\.?\d+)/);
    if (m) return { latitude: parseFloat(m[1]), longitude: parseFloat(m[2]) };
    m = u.match(/[?&]q=(-?\d+\.?\d+),(-?\d+\.?\d+)/);
    if (m) return { latitude: parseFloat(m[1]), longitude: parseFloat(m[2]) };
    return null;
  };

  // Try direct parsing first (full Google Maps URLs)
  const direct = parse(url);
  if (direct) return direct;

  // For goo.gl short links: resolve via Edge Function
  if (url.startsWith('https://goo.gl/') || url.startsWith('https://maps.app.goo.gl/')) {
    try {
      const res = await fetch(
        `https://kkoeeyqxubtcqvonckss.supabase.co/functions/v1/resolve-url?url=${encodeURIComponent(url)}`
      );
      const json = await res.json();
      if (json.url) return parse(json.url);
    } catch (e) {
      console.warn('[resolveUrl]', e);
    }
  }

  return null;
}

async function _loadCheckinWeather(tourId, destination, startDate, endDate, mapsLink, tour = null) {
  const weatherEl = document.getElementById(`checkin-weather-${tourId}`);
  if (!weatherEl) return;

  const wmoIcon = (code) => {
    if (code === 0)  return '☀️';
    if (code <= 2)   return '⛅';
    if (code <= 3)   return '☁️';
    if (code <= 48)  return '🌫️';
    if (code <= 67)  return '🌧️';
    if (code <= 77)  return '❄️';
    if (code <= 82)  return '🌧️';
    if (code <= 86)  return '❄️';
    return '⚡';
  };

  const forecastConfidence = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(`${startDate}T00:00:00`);
    const daysUntilStart = Math.round((start - today) / 86400000);
    if (daysUntilStart <= 3) return { label: 'HOCH', className: 'high' };
    if (daysUntilStart <= 7) return { label: 'MITTEL', className: 'medium' };
    return { label: 'NIEDRIG', className: 'low' };
  };

  const applyConfidence = (hasTruncated) => {
    const el = document.getElementById(`checkin-weather-confidence-${tourId}`);
    if (!el) return;
    const confidence = hasTruncated ? { label: 'NIEDRIG', className: 'low' } : forecastConfidence();
    el.textContent = `SICHERHEIT ${confidence.label}`;
    el.className = `checkin-weather-confidence checkin-weather-confidence-${confidence.className}`;
  };

  // Helper: write fetched data into current DOM (called from cache and from fresh fetch)
  const applyWeather = (days, codes, temps, precipProbs, precipSums, hasTruncated, maxDateStr) => {
    const el = document.getElementById(`checkin-weather-${tourId}`);
    if (!el) return;
    applyConfidence(hasTruncated);
    el.querySelectorAll('.checkin-weather-day').forEach(row => {
      const date = row.dataset.date;
      const idx  = days.indexOf(date);
      if (idx !== -1) {
        row.querySelector('[data-wicon]').textContent = wmoIcon(codes[idx]);
        row.querySelector('[data-wtemp]').textContent = `${Math.round(temps[idx])}°C`;
        row.querySelector('[data-wrainprob]').textContent = `🌧 ${Math.round(precipProbs[idx] || 0)}%`;
        row.querySelector('[data-wrain]').textContent = `${Number(precipSums[idx] || 0).toLocaleString('de-DE', { maximumFractionDigits: 1 })}mm`;
      } else if (date > maxDateStr) {
        row.querySelector('[data-wicon]').textContent = '—';
        row.querySelector('[data-wtemp]').textContent = '';
        row.querySelector('[data-wrainprob]').textContent = '';
        row.querySelector('[data-wrain]').textContent = '';
        row.style.opacity = '0.4';
      }
    });
    // Show hint only if not already present (SWR renders twice → guard against duplicates)
    if (hasTruncated && !el.parentNode.querySelector('.checkin-weather-hint')) {
      const hint = document.createElement('div');
      hint.className = 'checkin-weather-hint';
      hint.style.setProperty('font-family', "'JetBrains Mono', 'SF Mono', Menlo, monospace");
      hint.style.setProperty('font-size', '10px');
      hint.style.setProperty('color', '#82817a');
      hint.style.setProperty('margin-top', '6px');
      hint.style.setProperty('letter-spacing', '0.03em');
      hint.textContent = '⏳ Vorhersage max. 16 Tage im Voraus verfügbar';
      el.after(hint);
    }
  };

  // Clamp end_date to Open-Meteo's 16-day limit (computed once, used by cache + fetch)
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 15);
  const maxDateStr   = maxDate.toISOString().slice(0, 10);
  const clampedEnd   = endDate > maxDateStr ? maxDateStr : endDate;
  const hasTruncated = endDate > maxDateStr;

  // --- Cache check: show cached data immediately, refresh online after 1 hour ---
  if (!state.weatherCache) state.weatherCache = {};
  const WEATHER_CACHE_MAX_AGE_MS = 60 * 60 * 1000;
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const routeMetaKey = tour?.route_metadata
    ? `${tour.route_metadata.trackCount || 0}:${tour.route_metadata.waypointCount || 0}`
    : (tour?.gpx_route ? 'gpx' : '');
  const cacheKey = ['v4', destination || '', startDate || '', endDate || '', mapsLink || '', routeMetaKey].join('|');
  const cached = state.weatherCache[tourId];
  const cachedFetchedAt = cached?.fetchedAt
    || (cached?.fetchDate ? Date.parse(`${cached.fetchDate}T00:00:00`) : 0);
  const cacheMatches = cached && (!cached.cacheKey || cached.cacheKey === cacheKey);
  const hasFreshCache = cacheMatches && cachedFetchedAt && (now - cachedFetchedAt < WEATHER_CACHE_MAX_AGE_MS);
  const isOnline = navigator.onLine !== false;

  if (cacheMatches) {
    applyWeather(
      cached.days || [],
      cached.codes || [],
      cached.temps || [],
      cached.precipProbs || [],
      cached.precipSums || [],
      hasTruncated,
      maxDateStr
    );
    if (hasFreshCache || !isOnline) return;
  }
  if (!isOnline) return;

  try {
    // 1. Resolve coordinates — prefer Treffpunkt maps link, then destination, then GPX start
    let latitude, longitude;
    const fromMap = await _extractMapCoords(mapsLink);
    if (fromMap) {
      ({ latitude, longitude } = fromMap);
    } else {
      if (destination) {
        const geoResp = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(destination)}&count=1&language=de&format=json`
        );
        const geoData = await geoResp.json();
        if (geoData.results?.length) ({ latitude, longitude } = geoData.results[0]);
      }
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        let routeMetadata = tour?.route_metadata;
        if (!routeMetadata && tour?.gpx_route && typeof buildRouteMetadata === 'function') {
          routeMetadata = buildRouteMetadata(tour.gpx_route);
          tour.route_metadata = routeMetadata;
        }
        const firstMetaPoint = routeMetadata?.tracks?.[0]?.start;
        const metaLat = Number(firstMetaPoint?.lat);
        const metaLon = Number(firstMetaPoint?.lon ?? firstMetaPoint?.lng);
        if (Number.isFinite(metaLat) && Number.isFinite(metaLon)) {
          latitude = metaLat;
          longitude = metaLon;
        }
      }
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        if (!tour?.gpx_route && typeof loadTourRouteGeometry === 'function') {
          const routeFields = await loadTourRouteGeometry(tourId);
          if (routeFields && tour) Object.assign(tour, routeFields);
        }
        const gpx = normalizeGPXRoute(tour?.gpx_route);
        const firstPoint = (gpx?.tracks || [])
          .flatMap(track => track.points || [])
          .find(p => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1]));
        if (firstPoint) {
          latitude = firstPoint[0];
          longitude = firstPoint[1];
        }
      }
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    }

    // 2. Fetch forecast (only if tour start is within forecast window)
    const days  = [];
    const codes = [];
    const temps = [];
    const precipProbs = [];
    const precipSums  = [];
    if (startDate <= maxDateStr) {
      const weatherResp = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,weathercode,precipitation_probability_max,precipitation_sum&timezone=auto&start_date=${startDate}&end_date=${clampedEnd}`,
        { cache: 'no-store' }
      );
      const weatherData = await weatherResp.json();
      days.push(...(weatherData.daily?.time                          || []));
      codes.push(...(weatherData.daily?.weathercode                   || []));
      temps.push(...(weatherData.daily?.temperature_2m_max            || []));
      precipProbs.push(...(weatherData.daily?.precipitation_probability_max || []));
      precipSums.push(...(weatherData.daily?.precipitation_sum        || []));
    }

    // 3. Save to cache so SWR second-render reuses without re-fetching
    state.weatherCache[tourId] = { days, codes, temps, precipProbs, precipSums, fetchDate: today, fetchedAt: Date.now(), cacheKey };
    if (typeof persistState === 'function') persistState();

    // 4. Apply to DOM
    applyWeather(days, codes, temps, precipProbs, precipSums, hasTruncated, maxDateStr);
  } catch (e) {
    console.warn('[checkin weather]', e);
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

function _withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms)),
  ]);
}

/* ----------------------------------------------------------
   Boot
   ---------------------------------------------------------- */

/**
 * Application entry point.
 * Checks for an existing Supabase session and routes accordingly.
 */
async function init() {
  window.addEventListener('resize', () => {
    syncStickyLayout();
    fitTourCardAvatars();
  });

  // ─── State-Persistenz: Auto-Save bei Hintergrund/Schließen ────────
  // Wenn die App in den Hintergrund geht, State in localStorage sichern.
  // So überlebt sie einen Kaltstart durch das Mobile-OS.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) persistState();
  });
  window.addEventListener('pagehide', persistState);
  // Auch periodisch sichern (alle 30s) für Worst-Case-Crashes
  setInterval(persistState, 30000);
  startForegroundRefresh();

  // Listen for auth events — handle token refresh failures gracefully
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED') return; // all good
    if (event === 'SIGNED_OUT' || (!session && event === 'INITIAL_SESSION')) return;
    // If token refresh failed (session becomes null unexpectedly):
    //   - Online: redirect to login (token actually invalid)
    //   - Offline: keep using last known state, don't kick user out
    if (!session && state.currentUser) {
      if (!navigator.onLine) {
        console.warn('[auth] Session refresh failed but offline — keeping cached state');
        return;
      }
      console.warn('[auth] Session lost — redirecting to login');
      state.currentUser = null;
      stopHeartbeat();
      clearPersistedState();
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

  // Password reset link: #reset=TOKEN
  const resetToken = location.hash.startsWith('#reset=') ? location.hash.slice(7) : null;
  if (resetToken) {
    state.resetToken = resetToken;
    history.replaceState(null, '', location.pathname + location.search);
    // If user is already logged in, sign them out so the reset flow runs cleanly
    try { await sb.auth.signOut(); } catch(e) {}
    state.currentUser = null;
    state.view = 'reset-password';
    render();
    return;
  }

  // iOS/PWA cold start: persisted state is only rendered before auth when
  // offline. Online we wait for Supabase session/profile first; otherwise an
  // installed PWA can briefly expose stale cross-version state after updates.
  const restoredAtBoot = restoreState() && !!state.currentUser;
  if (restoredAtBoot && !navigator.onLine) {
    console.log('[init] Boot mit gespeichertem State');
    await hydrateCurrentTourGpxFromCache();
    state.view = state.currentCommunityId ? 'community-home' : 'communities';
    render();
    return;
  } else if (!navigator.onLine) {
    state.authMode = 'login';
    state.authErr  = 'Offline - keine gespeicherten Daten gefunden.';
    state.view     = 'auth';
    render();
    return;
  }

  try {
    const { data: { session } } = await _withTimeout(sb.auth.getSession(), 3500);

    if (!session) {
      clearPersistedState();
      state.currentUser = null;
      state.authMode = 'login';
      state.view     = 'auth';
      render();
      return;
    }

    if (session) {
      if (restoredAtBoot && state.currentUser?.id && state.currentUser.id !== session.user.id) {
        clearPersistedState();
        state.currentCommunityId = null;
        state.currentCommunity = null;
        state.currentTourId = null;
        state.currentTour = null;
        state.tours = [];
        state.myTourIds = new Set();
        state.communityPolls = [];
        state.communityMessages = [];
        state.communityChangelog = [];
        state.seenState = {};
      }

      // Vor dem Profile-Fetch: gespeicherten State opportunistisch laden,
      // damit SWR-Fast-Path greifen kann (sofortiges Render mit alten Daten,
      // dann stille Aktualisierung im Hintergrund)
      if (!restoredAtBoot || state.currentUser?.id !== session.user.id) restoreState(session.user.id);

      const { data: profile } = await _withTimeout(
        sb
          .from('profiles')
          .select('username, default_community_id')
          .eq('id', session.user.id)
          .single(),
        3500
      );

      if (profile) {
        state.currentUser = {
          id: session.user.id,
          username: profile.username,
          defaultCommunityId: profile.default_community_id || null,
        };
        state.profileCache[session.user.id] = profile.username;
        await migrateLegacySeenStateForCurrentUser();
        startHeartbeat();

        if (joinId) {
          await loadHomeData();
          if (state.myTourIds.has(joinId)) {
            await navigateTo('tour', { currentTourId: joinId, currentTab: 'overview' });
          } else {
            await navigateTo('join');
          }
        } else if (profile.default_community_id) {
          // Auto-redirect to default community
          await navigateTo('community-home', { currentCommunityId: profile.default_community_id });
        } else {
          await navigateTo('communities');
        }
        return;
      }
    }
  } catch (e) {
    console.error('[init] session check failed:', e);
    if (restoredAtBoot) {
      state.view = state.currentCommunityId ? 'community-home' : 'communities';
      render();
      toast('Verbindung fehlgeschlagen. Zeige gespeicherte Daten.', 'error');
      return;
    }
    state.authMode = 'login';
    state.authErr  = navigator.onLine ? 'Verbindung fehlgeschlagen. Bitte später erneut versuchen.' : 'Offline - keine gespeicherten Daten gefunden.';
    state.view     = 'auth';
    render();
    return;
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
