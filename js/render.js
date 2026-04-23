/* ============================================================
   render.js – Pure HTML-rendering functions (no side-effects)
   Depends on: state.js (state), utils.js (esc, daysInMonth)
   ============================================================ */

/* ----------------------------------------------------------
   Auth screen
   ---------------------------------------------------------- */

function renderAuth() {
  const isLogin = state.authMode === 'login';
  return `
<div class="auth-screen">
  <div class="auth-branding">
    <img src="img/logo.png" alt="MotoRoute" style="width:200px;margin-bottom:20px" />
    <div class="auth-branding-logo">MOTO<span>ROUTE</span></div>
    <div class="auth-branding-tagline">Motorrad-Touren gemeinsam entdecken und planen.</div>
    <div class="auth-feature">
      <div class="auth-feature-icon">🗺️</div>
      <div class="auth-feature-text">
        <strong>Interaktive Karten</strong>
        <span>GPX hochladen, Route anzeigen &amp; herunterladen</span>
      </div>
    </div>
    <div class="auth-feature">
      <div class="auth-feature-icon">👥</div>
      <div class="auth-feature-text">
        <strong>Gruppen-Touren</strong>
        <span>Passwortgeschützte Touren für deine Crew</span>
      </div>
    </div>
    <div class="auth-feature">
      <div class="auth-feature-icon">💬</div>
      <div class="auth-feature-text">
        <strong>Gruppen-Chat</strong>
        <span>Kommuniziere direkt in jeder Tour</span>
      </div>
    </div>
    <div class="auth-feature">
      <div class="auth-feature-icon">📅</div>
      <div class="auth-feature-text">
        <strong>Planungskalender</strong>
        <span>Termine und Routen übersichtlich planen</span>
      </div>
    </div>
  </div>

  <div class="auth-form-panel">
    <div class="auth-form-box">
      <div class="auth-form-title">${isLogin ? 'Willkommen' : 'Account erstellen'}</div>
      <div class="auth-form-sub">
        ${isLogin ? 'Melde dich mit deinem Benutzernamen an.' : 'Erstelle deinen kostenlosen Account.'}
      </div>

      ${state.authErr ? `<div class="auth-err">⚠️ ${esc(state.authErr)}</div>` : ''}

      <div class="form-group">
        <label>Benutzername</label>
        <input type="text" id="a-name" placeholder="z.B. MaxMuster"
          maxlength="30" autocomplete="username" />
      </div>
      <div class="form-group">
        <label>Passwort</label>
        <input type="password" id="a-pw"
          placeholder="${isLogin ? 'Dein Passwort' : 'Mindestens 6 Zeichen'}"
          autocomplete="${isLogin ? 'current-password' : 'new-password'}" />
      </div>
      ${!isLogin ? `
      <div class="form-group">
        <label>Passwort wiederholen</label>
        <input type="password" id="a-pw2" placeholder="Passwort bestätigen"
          autocomplete="new-password" />
      </div>` : ''}

      <button class="btn btn-primary" id="auth-btn"
        style="width:100%;justify-content:center;padding:13px;font-size:15px">
        ${isLogin ? 'Anmelden →' : 'Account erstellen →'}
      </button>

      <div class="auth-toggle">
        ${isLogin
          ? 'Noch kein Account? <a id="auth-switch">Jetzt registrieren</a>'
          : 'Bereits registriert? <a id="auth-switch">Anmelden</a>'}
      </div>
    </div>
  </div>
</div>`;
}

/* ----------------------------------------------------------
   Navigation bar
   ---------------------------------------------------------- */

function renderNav() {
  return `
<nav class="nav">
  <div class="nav-logo" id="nav-logo"><img src="img/logo.png" alt="MotoRoute" class="nav-logo-img" /><span class="nav-logo-text">MOTO<span>ROUTE</span></span></div>
  <div class="nav-user">
    <span class="nav-user-icon">🏍️</span> <strong>${esc(state.currentUser?.username || '')}</strong>
    <button class="btn-ghost btn-sm nav-icon-btn" id="site-info-btn" title="Über MotoRoute & Changelog">
      <span class="nav-icon-emoji">ℹ️</span><span class="nav-icon-label">Info</span>
    </button>
    <button class="btn-ghost btn-sm nav-icon-btn" id="go-profile" title="Profil & Benachrichtigungen">
      <span class="nav-icon-emoji">⚙️</span><span class="nav-icon-label">Einstellungen</span>
    </button>
    <button class="btn-logout" id="logout-btn"><span class="logout-text">Abmelden</span><span class="logout-icon">⏻</span></button>
  </div>
</nav>
${renderSiteInfoModal()}
${renderProfileModal()}
${renderCommunitySettingsModal()}`;
}

/* ----------------------------------------------------------
   Home
   ---------------------------------------------------------- */

function renderHome() {
  const myTours    = state.tours.filter(t =>  state.myTourIds.has(t.id));
  const otherTours = state.tours.filter(t => !state.myTourIds.has(t.id));

  return `
<div class="home-layout">
  <!-- Tour list -->
  <div>
    <div class="section-header">
      <h1 class="section-title">Deine Touren</h1>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" id="go-join">+ Beitreten</button>
        <button class="btn btn-primary btn-sm" id="go-create">+ Tour erstellen</button>
      </div>
    </div>

    ${myTours.length === 0
      ? `<div class="empty-state">
           <div class="empty-icon">🗺️</div>
           <div class="empty-title">Noch keine Touren</div>
           <p class="empty-sub">Erstelle eine neue Tour oder tritt mit einem Passwort bei.</p>
         </div>`
      : `<div class="tour-grid">${myTours.map(t => renderTourCard(t, false)).join('')}</div>`}

    ${otherTours.length > 0 ? `
      <div style="margin-top:40px">
        <div class="section-header">
          <h2 class="section-title-sm" style="color:var(--muted)">Andere Touren</h2>
        </div>
        <div class="tour-grid">${otherTours.map(t => renderTourCard(t, true)).join('')}</div>
      </div>` : ''}
  </div>

  <!-- Sidebar -->
  <div>
    ${renderCalWidget()}
    <div style="margin-top:20px;padding:18px;background:var(--surface);border:1px solid var(--border);border-radius:12px;font-size:13px;color:var(--muted);line-height:1.9">
      <div style="font-family:var(--font-display);font-size:18px;letter-spacing:1px;color:var(--text);margin-bottom:8px">Schnellstart</div>
      <div>🛡️ <strong style="color:var(--text)">Admin</strong> — erstellt Tour + Passwort</div>
      <div>👥 <strong style="color:var(--text)">Mitglieder</strong> — treten mit Passwort bei</div>
      <div>🗺️ <strong style="color:var(--text)">GPX</strong> — hochladen &amp; herunterladen</div>
      <div>💬 <strong style="color:var(--text)">Chat</strong> — innerhalb jeder Tour</div>
    </div>
  </div>
</div>`;
}

function renderTourCard(tour, locked) {
  const date     = new Date(tour.date + 'T12:00:00');
  const isAdmin  = tour.admin_id === state.currentUser.id || (tour.co_admin_ids||[]).includes(state.currentUser.id);
  const isMine   = state.myTourIds.has(tour.id);
  const dateStr  = date.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
  const adminName   = state.profileCache[tour.admin_id] || '…';
  // +1 for the admin who is not in tour_members
  const memberCount = (state.memberCounts[tour.id] || 0) + 1;

  // Unread badges (only for tours the user is a member of)
  const newMsgs    = isMine ? (state.homeBadges[tour.id]?.chat     || 0) : 0;
  const newChanges = isMine ? (state.homeBadges[tour.id]?.changelog || 0) : 0;
  const badgesHtml = (newMsgs > 0 || newChanges > 0) ? `
    <div class="tour-card-badges">
      ${newMsgs    > 0 ? `<span class="tour-card-badge">💬 ${newMsgs    > 99 ? '99+' : newMsgs}</span>`    : ''}
      ${newChanges > 0 ? `<span class="tour-card-badge">📋 ${newChanges > 99 ? '99+' : newChanges}</span>` : ''}
    </div>` : '';

  return `
<div class="card tour-card" data-tour-id="${tour.id}">
  <div class="tour-card-stripe"></div>
  <div class="tour-card-header">
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px">
      ${isAdmin ? '<span class="tag tag-accent">Admin</span>' : ''}
      ${locked  ? '<span class="tag tag-muted">🔒 Passwort nötig</span>' : ''}
    </div>
    <div class="tour-card-name">${esc(tour.name)}</div>
  </div>
  <div style="padding:0 22px">
    <div class="tour-card-meta">
      <span>📅 ${dateStr}</span>
      <span>📍 ${esc(tour.destination || 'Kein Ziel')}</span>
      <span>📏 ${esc(tour.distance    || '—')}</span>
    </div>
  </div>
  <div class="tour-card-footer">
    <div style="display:flex;flex-direction:column;gap:3px">
      <span style="font-size:12px;color:var(--muted)">von ${esc(adminName)}</span>
      <span style="font-size:12px;color:var(--muted)">👥 ${memberCount} Mitfahrer</span>
    </div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
      ${badgesHtml}
      <div style="display:flex;gap:6px;align-items:center">
        <button class="btn-copy-link" data-copy-id="${tour.id}" title="Einladungslink kopieren">🔗</button>
        ${isMine
          ? `<button class="btn btn-primary btn-sm" data-open-id="${tour.id}">Öffnen →</button>`
          : `<button class="btn btn-ghost btn-sm"   data-join-id="${tour.id}">Beitreten</button>`}
      </div>
    </div>
  </div>
</div>`;
}

/* ----------------------------------------------------------
   Home calendar widget
   ---------------------------------------------------------- */

/** Color palette for tours in the calendar — distinct from track colors */
const TOUR_PALETTE = [
  '#f07800', '#3dba7b', '#4a9eff', '#e04444',
  '#c97bff', '#f5c400', '#ff6b9d', '#00d4aa',
];

function renderCalWidget() {
  if (!state.calMonth) state.calMonth = new Date();
  const y = state.calMonth.getFullYear();
  const m = state.calMonth.getMonth();

  const days     = daysInMonth(y, m);
  const firstDay = (new Date(y, m, 1).getDay() + 6) % 7;
  const today    = new Date();
  const monthStart = new Date(y, m, 1);
  const monthEnd   = new Date(y, m, days);

  const myTours    = state.tours.filter(t =>  state.myTourIds.has(t.id));
  const otherTours = state.tours.filter(t => !state.myTourIds.has(t.id));
  const toursToShow = state.calShowAll ? [...myTours, ...otherTours] : myTours;

  // Map: dayNumber → [{name, color, isMine}]
  const dayMap = {};
  const visibleMine  = [];
  const visibleOther = [];

  toursToShow.forEach((tour, idx) => {
    const isMine = state.myTourIds.has(tour.id);
    // Own tours use the palette; other tours use muted grey tones
    const color  = isMine
      ? TOUR_PALETTE[myTours.indexOf(tour) % TOUR_PALETTE.length]
      : '#7a7880';

    const start = new Date(tour.date + 'T12:00:00');
    const end   = tour.end_date ? new Date(tour.end_date + 'T12:00:00') : start;

    if (start > monthEnd || end < monthStart) return;
    if (isMine) visibleMine.push({ name: tour.name, color });
    else        visibleOther.push({ name: tour.name, color });

    const cursor = new Date(Math.max(start, monthStart));
    cursor.setHours(12, 0, 0, 0); // normalise to noon — avoids DST skip
    const limit  = new Date(Math.min(end,   monthEnd));
    limit.setHours(12, 0, 0, 0);
    while (cursor <= limit) {
      const dn = cursor.getDate();
      if (!dayMap[dn]) dayMap[dn] = [];
      dayMap[dn].push({ name: tour.name, color, isMine });
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(12, 0, 0, 0);
    }
  });

  const monthName = state.calMonth.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  const total     = Math.ceil((firstDay + days) / 7) * 7;

  let cells = '';
  for (let i = 0; i < total; i++) {
    const dn   = i - firstDay + 1;
    const inM  = dn >= 1 && dn <= days;
    const isToday = inM && today.getDate() === dn && today.getMonth() === m && today.getFullYear() === y;
    const tours   = inM ? (dayMap[dn] || []) : [];

    // Tint based on first own tour; fall back to first other tour (dimmer)
    const firstMine  = tours.find(t => t.isMine);
    const firstOther = tours.find(t => !t.isMine);
    const bg = firstMine  ? `background:${firstMine.color}26;`
             : firstOther ? `background:${firstOther.color}18;` : '';

    const cls = ['cal-day', !inM && 'other-month', isToday && 'today', tours.length && 'has-tour']
      .filter(Boolean).join(' ');

    const dots = tours.slice(0, 3)
      .map(t => `<span class="cal-day-dot" style="background:${t.color};opacity:${t.isMine ? 1 : 0.45}"></span>`)
      .join('');

    cells += `<div class="${cls}" style="${bg}">${inM ? dn : ''}${dots ? `<div class="cal-day-dots">${dots}</div>` : ''}</div>`;
  }

  const legendMine  = visibleMine.map(t => `
    <div class="cal-legend-item">
      <span class="cal-legend-swatch" style="background:${t.color}"></span>
      <span class="cal-legend-name">${esc(t.name)}</span>
    </div>`).join('');

  const legendOther = visibleOther.length && state.calShowAll ? `
    <div class="cal-legend-divider">Andere Touren</div>
    ${visibleOther.map(t => `
    <div class="cal-legend-item" style="opacity:.55">
      <span class="cal-legend-swatch" style="background:${t.color}"></span>
      <span class="cal-legend-name">${esc(t.name)}</span>
    </div>`).join('')}` : '';

  const legendHtml = (legendMine + legendOther) ||
    `<span style="color:var(--muted);font-size:11px">Keine Touren in diesem Monat</span>`;

  return `
<div class="calendar-widget">
  <div class="cal-nav">
    <button class="cal-nav-btn" id="cal-prev">‹</button>
    <div class="cal-title">${monthName}</div>
    <button class="cal-nav-btn" id="cal-next">›</button>
  </div>
  <div class="cal-grid">
    ${['Mo','Di','Mi','Do','Fr','Sa','So'].map(d => `<div class="cal-dow">${d}</div>`).join('')}
    ${cells}
  </div>
  <div class="cal-legend-list">${legendHtml}</div>
  <label class="cal-show-all-label">
    <input type="checkbox" id="cal-show-all" ${state.calShowAll ? 'checked' : ''} />
    Alle Touren anzeigen
  </label>
</div>`;
}

/* ----------------------------------------------------------
   Changelog tab
   ---------------------------------------------------------- */

function renderChangelogTab() {
  const entries = state.tourChangelog;

  if (!entries.length) {
    return `<div class="tab-scroll"><div style="padding:40px;text-align:center;color:var(--muted)">
      <div style="font-size:40px;margin-bottom:12px">📝</div>
      <div style="font-family:var(--font-display);font-size:22px;letter-spacing:1px;color:var(--text);margin-bottom:6px">Noch keine Einträge</div>
      <div style="font-size:13px">Änderungen an der Tour werden hier automatisch protokolliert.</div>
    </div></div>`;
  }

  const rows = entries.map(e => {
    const dt  = new Date(e.created_at);
    const date = dt.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'2-digit' });
    const time = dt.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });

    const hasOld = e.old_value && e.old_value !== '';
    const hasNew = e.new_value && e.new_value !== '';

    let changeHtml = '';
    if (hasOld && hasNew) {
      changeHtml = `<span class="cl-old">${esc(e.old_value)}</span>
                    <span class="cl-arrow">→</span>
                    <span class="cl-new">${esc(e.new_value)}</span>`;
    } else if (hasNew) {
      changeHtml = `<span class="cl-new">+ ${esc(e.new_value)}</span>`;
    } else if (hasOld) {
      changeHtml = `<span class="cl-old">− ${esc(e.old_value)}</span>`;
    }

    return `<div class="cl-row">
      <div class="cl-meta">
        <span class="cl-user">${esc(e.username)}</span>
        <span class="cl-time">${date}, ${time}</span>
      </div>
      <div class="cl-field">${esc(e.field)}</div>
      <div class="cl-change">${changeHtml}</div>
    </div>`;
  }).join('');

  return `<div class="tab-scroll"><div style="padding:24px;max-width:760px">
    <h2 style="font-family:var(--font-display);font-size:28px;letter-spacing:1px;margin-bottom:20px">Change Log</h2>
    <div class="cl-list">${rows}</div>
  </div></div>`;
}

/* ----------------------------------------------------------
   Create tour form
   ---------------------------------------------------------- */

function renderCreate() {
  const today = new Date().toISOString().split('T')[0];
  return `
<div class="page-form">
  <button class="btn btn-ghost btn-sm" style="margin-bottom:24px" id="back-home">← Zurück</button>
  <div class="page-title">Tour Erstellen</div>
  <div class="page-sub">Lege eine neue Tour für „${esc(state.currentCommunity?.name || '')}" an. Du bist automatisch Admin.</div>

  <div class="form-group">
    <label>Tour-Name *</label>
    <input type="text" id="f-name" placeholder="z.B. Schwarzwald Runde" maxlength="60" />
  </div>
  <div class="form-group">
    <label>Beschreibung</label>
    <textarea id="f-desc" placeholder="Was erwartet die Teilnehmer?"></textarea>
  </div>
  <div class="form-row">
    <div class="form-group">
      <label>Startdatum *</label>
      <input type="date" id="f-date" min="${today}" />
    </div>
    <div class="form-group">
      <label>Enddatum (optional)</label>
      <input type="date" id="f-edate" min="${today}" />
    </div>
  </div>
  <div class="form-row">
    <div class="form-group">
      <label>Ziel / Region</label>
      <input type="text" id="f-dest" placeholder="z.B. Titisee, BW" maxlength="80" />
    </div>
  </div>

  <button class="btn btn-primary" id="create-submit"
    style="width:100%;justify-content:center;padding:13px;font-size:15px;margin-top:8px">
    Tour anlegen →
  </button>
</div>`;
}

/* ----------------------------------------------------------
   Join tour form
   ---------------------------------------------------------- */

function renderJoin() {
  const open = state.tours.filter(t => !state.myTourIds.has(t.id));
  return `
<div class="page-form">
  <button class="btn btn-ghost btn-sm" style="margin-bottom:24px" id="back-home">← Zurück</button>
  <div class="page-title">Tour Beitreten</div>
  <div class="page-sub">Wähle eine Tour und gib das Beitritts-Passwort ein.</div>

  ${open.length === 0
    ? `<div class="empty-state">
         <div class="empty-icon">🔍</div>
         <div class="empty-title">Keine offenen Touren</div>
         <p class="empty-sub">Du bist bereits Mitglied aller verfügbaren Touren.</p>
       </div>`
    : `
  <div class="form-group">
    <label>Tour auswählen</label>
    <select id="join-sel">
      <option value="">— Tour wählen —</option>
      ${open.map(t => `
        <option value="${t.id}" ${state.preJoinId === t.id ? 'selected' : ''}>
          ${esc(t.name)} · ${new Date(t.date + 'T12:00:00').toLocaleDateString('de-DE')} · von ${esc(state.profileCache[t.admin_id] || '?')}
        </option>`).join('')}
    </select>
  </div>
  <div class="form-group">
    <label>Passwort</label>
    <input type="password" id="join-pw" placeholder="Beitritts-Passwort" />
  </div>
  <button class="btn btn-primary" id="join-submit"
    style="width:100%;justify-content:center;padding:13px;font-size:15px">
    Beitreten →
  </button>`}
</div>`;
}

/* ----------------------------------------------------------
   Tour detail page
   ---------------------------------------------------------- */

function renderTour() {
  const tour = state.currentTour;
  if (!tour) return '<div style="padding:40px;color:var(--muted)">Tour nicht gefunden.</div>';

  const isAdmin = isCurrentUserAdmin();
  const tabs    = [
    { id: 'map',          label: '🗺️ Karte' },
    { id: 'chat',         label: '💬 Chat' },
    { id: 'media',        label: '📸 Media' },
    { id: 'participants', label: '👥 Teilnehmer' },
    { id: 'info',         label: '📋 Info & Kalender' },
    { id: 'changelog',    label: '📝 Change Log' },
  ];

  return `
<div class="tour-detail">
  <div class="tour-detail-header">
    <button class="btn btn-ghost btn-sm" id="back-home">← Zurück</button>
    <div class="tour-detail-title">${esc(tour.name)}</div>
    <div style="display:flex;gap:7px;flex-wrap:wrap">
      ${isAdmin ? '<span class="tag tag-accent">Admin</span>' : ''}
      <span class="tag tag-muted">
        📅 ${new Date(tour.date + 'T12:00:00').toLocaleDateString('de-DE', { day:'2-digit', month:'short', year:'numeric' })}
      </span>
      <span class="tag tag-muted" id="hdr-dest">📍 ${esc(tour.destination || 'Kein Ziel')}</span>
      <span class="tag tag-muted" id="hdr-dist">📏 ${esc(tour.distance    || '—')}</span>
      <button class="btn btn-ghost btn-sm" data-copy-id="${tour.id}">🔗 Einladen</button>
      ${tour.admin_id !== state.currentUser.id ? `<button class="map-btn map-btn-danger" id="leave-tour-btn" title="Tour verlassen">
        <span class="map-btn-icon">🚪</span><span class="map-btn-label">Tour verlassen</span>
      </button>` : ''}
    </div>
  </div>

  <div class="tour-tabs">
    ${tabs.map(t => {
      const badge   = state.tabBadges[t.id];
      const isActive = state.currentTab === t.id;
      const tooltipLines = badge
        ? badge.slice(0, 5).map(b => {
            const time = b.time.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });
            const date = b.time.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' });
            return `${date} ${time}  ${b.text}`;
          }).join('&#10;')
        : '';
      return `
      <button class="tab-btn ${isActive ? 'active' : ''}" data-tab="${t.id}">
        ${t.label}
        ${badge && !isActive
          ? `<span class="tab-badge" title="${tooltipLines}">${badge.length > 9 ? '9+' : badge.length}</span>`
          : ''}
      </button>`;
    }).join('')}
  </div>

  <div class="tab-content" id="tab-content">
    ${renderTab(tour)}
  </div>
</div>`;
}

function renderTab(tour) {
  switch (state.currentTab) {
    case 'map':          return renderMapTab(tour);
    case 'chat':         return renderChatTab();
    case 'media':        return renderMediaTab();
    case 'participants': return renderParticipantsTab();
    case 'info':         return renderInfoTab(tour);
    case 'changelog':    return renderChangelogTab();
    default: return '';
  }
}

/* ----------------------------------------------------------
   Map tab
   ---------------------------------------------------------- */

function renderMapTab(tour) {
  const gpxData = normalizeGPXRoute(tour.gpx_route);
  const isAdmin = isCurrentUserAdmin();
  const hasTracks = gpxData?.tracks?.length > 0;
  const hasWaypoints = gpxData?.waypoints?.length > 0;
  const hasAny = hasTracks || hasWaypoints;

  // Build sidebar track list
  let sidebarHtml = '';
  if (gpxData) {
    if (hasTracks) {
      const tracksHtml = gpxData.tracks.map((t, i) => {
        const color = t.color || TRACK_COLORS[i % TRACK_COLORS.length];
        const dist = calculateTrackDistance(gpxData, i);
        return `<div class="map-sidebar-item" data-track-idx="${i}" title="${esc(t.name)}">
          <span class="map-sidebar-dot" style="background:${color}"></span>
          <span class="map-sidebar-label">${esc(t.name)}</span>
          <span class="map-sidebar-count">${dist || '—'}</span>
        </div>`;
      }).join('');
      sidebarHtml += `<div class="map-sidebar-section">
        <div class="map-sidebar-title">Tracks (${gpxData.tracks.length})</div>
        ${tracksHtml}
        <div class="map-sidebar-item map-sidebar-reset" id="reset-highlight" style="margin-top:6px">
          <span style="font-size:13px">↩</span>
          <span class="map-sidebar-label" style="color:var(--muted)">Alle anzeigen</span>
        </div>
      </div>`;
    }
    if (hasWaypoints) {
      const wpsHtml = gpxData.waypoints.map((w, i) => {
        const emoji = garminSymToEmoji(w.sym);
        return `
        <div class="map-sidebar-item" data-wp-idx="${i}" title="${esc(w.name)}${w.sym ? ' (' + esc(w.sym) + ')' : ''}">
          <span style="font-size:15px;flex-shrink:0">${emoji}</span>
          <span class="map-sidebar-label">${esc(w.name)}</span>
        </div>`;
      }).join('');
      sidebarHtml += `<div class="map-sidebar-section">
        <div class="map-sidebar-title" style="display:flex;align-items:center;justify-content:space-between">
          <span>Wegpunkte (${gpxData.waypoints.length})</span>
          <button id="toggle-waypoints" class="map-sidebar-toggle" title="Wegpunkte ein-/ausblenden">👁 Alle</button>
        </div>
        ${wpsHtml}
      </div>`;
    }


  } else {
    sidebarHtml = `<div class="map-sidebar-empty">
      ${isAdmin ? '📁 GPX hochladen um Tracks zu sehen' : 'Kein GPX vorhanden'}
    </div>`;
  }

  return `
<div class="map-layout">
  <div id="map-container">
    <div id="map"></div>
    <div class="map-controls">
      <button class="map-btn" id="map-fullscreen">
        <span class="map-btn-icon" id="map-fs-icon">⛶</span>
        <span class="map-btn-label" id="map-fs-label">Vollbild</span>
      </button>
      ${isAdmin ? `
      <label class="map-btn" for="gpx-up" style="cursor:pointer">
        <span class="map-btn-icon">📁</span>
        <span class="map-btn-label">GPX hochladen</span>
        <input type="file" id="gpx-up" accept=".gpx" style="display:none" />
      </label>` : ''}
      ${hasAny ? `<button class="map-btn" id="gpx-dl">
        <span class="map-btn-icon">⬇️</span>
        <span class="map-btn-label">GPX herunterladen</span>
      </button>` : ''}
      ${hasAny && isAdmin ? `<button class="map-btn map-btn-danger" id="gpx-del">
        <span class="map-btn-icon">🗑️</span>
        <span class="map-btn-label">Route löschen</span>
      </button>` : ''}
    </div>
    <div class="map-info">
      ${hasAny
        ? `<span>📍 ${gpxData.tracks.length} Track${gpxData.tracks.length !== 1 ? 's' : ''}</span>
           ${hasWaypoints ? `<span>🚩 ${gpxData.waypoints.length} Wegpunkt${gpxData.waypoints.length !== 1 ? 'e' : ''}</span>` : ''}`
        : `<span>${isAdmin ? 'Keine Route — GPX-Datei hochladen' : 'Admin hat noch keine Route hochgeladen'}</span>`}
    </div>
  </div>
  <div class="map-sidebar" id="map-sidebar">
    ${sidebarHtml}
  </div>
</div>`;
}


/* ----------------------------------------------------------
   Chat tab
   ---------------------------------------------------------- */

function renderChatTab() {
  const msgs = state.tourMessages;
  return `
<div class="chat-layout">
  <div class="chat-messages" id="chat-msgs">
    ${msgs.length === 0
      ? `<div style="flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;color:var(--muted);font-size:14px;text-align:center">
           <div style="font-size:36px">💬</div>
           <p>Noch keine Nachrichten. Seid ihr startklar? 🏍️</p>
         </div>`
      : msgs.map(m => {
          const mine = m.user_id === state.currentUser.id;
          const msgDate = new Date(m.created_at);
          const today   = new Date();
          const isToday = msgDate.toDateString() === today.toDateString();
          const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
          const isYesterday = msgDate.toDateString() === yesterday.toDateString();

          const datePart = isToday     ? 'Heute'
                         : isYesterday ? 'Gestern'
                         : msgDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
          const timePart = msgDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
          const time = `${datePart}, ${timePart}`;
          return `
<div class="chat-msg ${mine ? 'mine' : ''}">
  <div class="chat-bubble">${esc(m.text)}</div>
  <div class="chat-meta">${esc(m.username)} · ${time}</div>
</div>`;
        }).join('')}
  </div>
  <div class="chat-input-bar">
    <button class="emoji-toggle-btn" id="emoji-toggle" title="Emoji">😊</button>
    <input type="text" id="chat-in" placeholder="Nachricht schreiben…" maxlength="500" />
    <button class="btn btn-primary" id="chat-send">Senden</button>
  </div>
  <div class="emoji-picker" id="emoji-picker" style="display:none"></div>
</div>`;
}

/* ----------------------------------------------------------
   Participants tab
   ---------------------------------------------------------- */

function renderParticipantsTab() {
  const viewerIsAdmin = isCurrentUserAdmin();
  const tour          = state.currentTour;
  const coAdmins      = tour?.co_admin_ids || [];
  const creatorId     = tour?.admin_id;

  return `
<div class="tab-scroll">
  <div class="participants-layout">
    <div style="margin-bottom:22px">
      <h2 style="font-family:var(--font-display);font-size:30px;letter-spacing:1px">
        Teilnehmer (${state.tourMembers.length})
      </h2>
    </div>
    ${state.tourMembers.map(m => {
      const isCreator  = m.user_id === creatorId;
      const isCoAdmin  = coAdmins.includes(m.user_id);
      const isMe       = m.user_id === state.currentUser.id;
      const roleLabel  = isCreator ? 'Admin & Ersteller' : isCoAdmin ? 'Co-Admin' : 'Mitfahrer';
      const roleColor  = (isCreator || isCoAdmin) ? 'var(--accent)' : 'var(--muted)';

      // Admin can promote members (not creator, not themselves, not already co-admin)
      const canPromote = viewerIsAdmin && !isCreator && !isCoAdmin && !isMe;
      // Creator can demote co-admins (not themselves)
      const canDemote  = tour?.admin_id === state.currentUser.id && isCoAdmin && !isMe;
      // Admin can remove any member (not creator, not themselves)
      const canKick    = viewerIsAdmin && !isCreator && !isMe;

      return `
    <div class="participant-item">
      <div class="participant-avatar" style="${(isCreator||isCoAdmin)?'background:var(--accent)':''}">${(m.username||'?')[0].toUpperCase()}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:500">${esc(m.username)}</div>
        <div style="font-size:12px;color:${roleColor}">${roleLabel}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        ${isMe ? '<span class="tag tag-accent">Du</span>' : ''}
        ${canPromote ? `<button class="btn btn-ghost btn-sm" data-promote="${m.user_id}" title="Zum Co-Admin machen">⬆️ Co-Admin</button>` : ''}
        ${canDemote  ? `<button class="btn btn-ghost btn-sm" data-demote="${m.user_id}"  title="Co-Admin entfernen" style="color:var(--danger)">Co-Admin ✕</button>` : ''}
        ${canKick    ? `<button class="btn btn-ghost btn-sm" data-kick="${m.user_id}" title="Aus Tour entfernen" style="color:var(--danger)">🚫</button>` : ''}
      </div>
    </div>`;
    }).join('')}
  </div>
</div>`;
}

/* ----------------------------------------------------------
   Info & calendar tab
   ---------------------------------------------------------- */

function renderDistanceSelector(tour) {
  const gpxData = normalizeGPXRoute(tour.gpx_route);
  if (!gpxData?.tracks?.length) {
    return '<p style="font-size:12px;color:var(--muted);margin-bottom:4px">Noch keine GPX-Route hochgeladen.</p>';
  }
  const totalDist = calculateTotalDistance(gpxData);
  const trackOpts = gpxData.tracks.map((t, i) => {
    const d = calculateTrackDistance(gpxData, i);
    return '<option value="track:' + i + '">Track: ' + esc(t.name) + (d ? ' (' + d + ')' : '') + '</option>';
  }).join('');
  const opts =
    '<option value="total">' + (totalDist ? 'Gesamtdistanz (' + totalDist + ')' : 'Gesamtdistanz') + '</option>' +
    trackOpts +
    '<option value="manual">Manuell eingeben</option>';
  return [
    '<div class="form-group" style="margin-bottom:8px">',
    '  <label>Quelle</label>',
    '  <select id="dist-source">' + opts + '</select>',
    '</div>',
    '<div id="dist-manual-wrap" style="display:none" class="form-group">',
    '  <label>Manuelle Eingabe</label>',
    '  <input type="text" id="dist-manual" placeholder="z.B. 350 km" />',
    '</div>',
  ].join('');
}

function renderInfoTab(tour) {
  const isAdmin = isCurrentUserAdmin();

  return `
<div class="tab-scroll">
  <div class="info-layout">
    <div class="info-grid">

      <!-- Left: tour details + admin edit form -->
      <div>
        <h2 style="font-family:var(--font-display);font-size:28px;letter-spacing:1px;margin-bottom:20px">Tour-Details</h2>
        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:24px">
          <div class="info-block">
            <div class="info-label">Beschreibung</div>
            <div>${esc(tour.description || 'Keine Beschreibung')}</div>
          </div>
          <div class="info-block">
            <div class="info-label">Startdatum</div>
            <div>${new Date(tour.date + 'T12:00:00').toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })}</div>
          </div>
          ${tour.end_date ? `
          <div class="info-block">
            <div class="info-label">Enddatum</div>
            <div>${new Date(tour.end_date + 'T12:00:00').toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })}</div>
          </div>` : ''}
          <div class="info-block">
            <div class="info-label">Ziel / Region</div>
            <div id="info-dest">${esc(tour.destination || '—')}</div>
          </div>
          <div class="info-block">
            <div class="info-label">Distanz <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--muted);font-size:10px">— automatisch aus GPX</span></div>
            <div id="info-dist">${esc(tour.distance || '—')}</div>
          </div>
          <div class="info-block">
            <div class="info-label">Admin</div>
            <div>${esc(state.profileCache[tour.admin_id] || '—')}</div>
          </div>
        </div>

        ${isAdmin ? `
        <div class="divider"></div>
        <h3 style="font-size:15px;font-weight:600;margin-bottom:14px">⚙️ Infos bearbeiten</h3>
        <div class="form-group">
          <label>Tour-Name</label>
          <input type="text" id="edit-name" value="${esc(tour.name)}" maxlength="60" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Startdatum</label>
            <input type="date" id="edit-date" value="${esc(tour.date || '')}" />
          </div>
          <div class="form-group">
            <label>Enddatum</label>
            <input type="date" id="edit-edate" value="${esc(tour.end_date || '')}" />
          </div>
        </div>
        <div class="form-group">
          <label>Ziel / Region</label>
          <input type="text" id="edit-dest" value="${esc(tour.destination || '')}" />
        </div>
        <div class="form-group">
          <label>Beschreibung</label>
          <textarea id="edit-desc">${esc(tour.description || '')}</textarea>
        </div>
        <div class="divider" style="margin:16px 0 14px"></div>
        <h4 style="font-size:13px;font-weight:600;margin-bottom:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em">
          📏 Distanz berechnen
        </h4>
        ${renderDistanceSelector(tour)}
        <button class="btn btn-primary btn-sm" id="edit-save">Änderungen speichern</button>
        <div class="divider"></div>
        <h3 style="font-size:15px;font-weight:600;margin-bottom:12px;color:var(--danger)">⚠️ Gefahrenzone</h3>
        <button class="btn btn-danger btn-sm" id="delete-tour-btn" style="width:100%;justify-content:center">🗑️ Tour endgültig löschen</button>
        ` : ''}
      </div>

      <!-- Right: planning calendar -->
      <div>
        <h2 style="font-family:var(--font-display);font-size:28px;letter-spacing:1px;margin-bottom:20px">Planungskalender</h2>
        ${renderTourCal(tour)}

        <div style="margin-top:18px">
          ${state.tourPlanDates.length === 0
            ? '<p style="color:var(--muted);font-size:13px;margin-bottom:12px">Noch keine Planungstermine.</p>'
            : ''}
          ${state.tourPlanDates.map(pd => `
          <div class="plan-date-item">
            <div>
              <strong>${new Date(pd.date + 'T12:00:00').toLocaleDateString('de-DE', { weekday:'short', day:'2-digit', month:'short' })}</strong>
              ${pd.label ? ` <span style="color:var(--muted)">— ${esc(pd.label)}</span>` : ''}
            </div>
            ${isAdmin ? `<button class="btn btn-ghost btn-sm" data-del-date="${pd.id}"
              style="color:var(--danger);padding:3px 8px">✕</button>` : ''}
          </div>`).join('')}
        </div>

        ${isAdmin ? `
        <div style="margin-top:16px;background:var(--surface2);border-radius:var(--radius);padding:16px">
          <div style="font-size:12px;font-weight:600;margin-bottom:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em">
            Termin hinzufügen
          </div>
          <div class="form-group" style="margin-bottom:10px">
            <label>Datum</label>
            <input type="date" id="add-date" />
          </div>
          <div class="form-group" style="margin-bottom:10px">
            <label>Beschriftung (optional)</label>
            <input type="text" id="add-label" placeholder="z.B. Abfahrt, Mittagspause…" maxlength="60" />
          </div>
          <button class="btn btn-ghost btn-sm" id="add-date-btn">+ Termin hinzufügen</button>
        </div>` : ''}
      </div>

    </div>
  </div>
</div>`;
}

/* ----------------------------------------------------------
   Tour planning calendar (inside info tab)
   ---------------------------------------------------------- */

function renderTourCal(tour) {
  const tourStart = new Date(tour.date + 'T12:00:00');
  const tourEnd   = tour.end_date ? new Date(tour.end_date + 'T12:00:00') : tourStart;
  const today     = new Date();
  const hasRange  = tour.end_date && tour.end_date !== tour.date;

  // Build list of months to display
  const months = [];
  const cur = new Date(tourStart.getFullYear(), tourStart.getMonth(), 1);
  const endMonth = new Date(tourEnd.getFullYear(), tourEnd.getMonth(), 1);
  while (cur <= endMonth) {
    months.push({ y: cur.getFullYear(), m: cur.getMonth() });
    cur.setMonth(cur.getMonth() + 1);
  }

  const multiMonth = months.length > 1;

  // Single month: full size with nav buttons
  if (!multiMonth) {
    const y = state.tourCalMonth.getFullYear();
    const m = state.tourCalMonth.getMonth();
    return _renderTourCalMonth(tour, y, m, tourStart, tourEnd, today, hasRange, true, false);
  }

  // Multi-month: 2-column grid, scaled down so total = same size as single month
  const blocks = months.map(({y, m}) =>
    _renderTourCalMonth(tour, y, m, tourStart, tourEnd, today, hasRange, false, true)
  ).join('');

  return `<div class="calendar-widget" style="background:var(--surface2);padding:12px">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${blocks}
    </div>
    <div class="cal-legend-list" style="margin-top:10px">
      <div class="cal-legend-item">
        <span class="cal-legend-swatch" style="background:var(--accent)"></span>
        <span class="cal-legend-name">Tourdauer</span>
      </div>
    </div>
  </div>`;
}

function _renderTourCalMonth(tour, y, m, tourStart, tourEnd, today, hasRange, showNav, small) {
  const days     = daysInMonth(y, m);
  const firstDay = (new Date(y, m, 1).getDay() + 6) % 7;

  const planSet = new Set();
  state.tourPlanDates.forEach(pd => {
    const d = new Date(pd.date + 'T12:00:00');
    if (d.getFullYear() === y && d.getMonth() === m) planSet.add(d.getDate());
  });

  const monthStart = new Date(y, m, 1);
  const monthEnd   = new Date(y, m, days);

  const tourDays = new Set();
  if (tourStart <= monthEnd && tourEnd >= monthStart) {
    const cursor = new Date(Math.max(tourStart, monthStart));
    cursor.setHours(12, 0, 0, 0);
    const limit  = new Date(Math.min(tourEnd, monthEnd));
    limit.setHours(12, 0, 0, 0);
    while (cursor <= limit) {
      tourDays.add(cursor.getDate());
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(12, 0, 0, 0);
    }
  }

  const total     = Math.ceil((firstDay + days) / 7) * 7;
  const monthName = new Date(y, m, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

  let cells = '';
  for (let i = 0; i < total; i++) {
    const dn  = i - firstDay + 1;
    const inM = dn >= 1 && dn <= days;

    const isToday  = inM && today.getDate() === dn && today.getMonth() === m && today.getFullYear() === y;
    const hasPlan  = inM && planSet.has(dn);
    const inTour   = inM && tourDays.has(dn);
    const isStart  = inTour && new Date(y, m, dn).toDateString() === tourStart.toDateString();
    const isEnd    = inTour && new Date(y, m, dn).toDateString() === tourEnd.toDateString();
    const isSingle = isStart && isEnd;

    const cls = ['cal-day', !inM && 'other-month', isToday && 'today', hasPlan && 'has-tour']
      .filter(Boolean).join(' ');

    let style = '';
    if (inTour) {
      if (isSingle) {
        style = 'background:var(--accent);color:#000;font-weight:700;border-radius:6px;';
      } else if (isStart) {
        style = 'background:var(--accent);color:#000;font-weight:700;border-radius:6px 0 0 6px;';
      } else if (isEnd) {
        style = 'background:var(--accent);color:#000;font-weight:700;border-radius:0 6px 6px 0;';
      } else {
        style = 'background:rgba(240,120,0,0.35);color:var(--text);border-radius:0;';
      }
    }

    cells += `<div class="${cls}" style="${style}">${inM ? dn : ''}</div>`;
  }

  if (showNav) {
    return `
<div class="calendar-widget" style="background:var(--surface2)">
  <div class="cal-nav">
    <button class="cal-nav-btn" id="tcal-prev">‹</button>
    <div class="cal-title" style="font-size:18px">${monthName}</div>
    <button class="cal-nav-btn" id="tcal-next">›</button>
  </div>
  <div class="cal-grid">
    ${['Mo','Di','Mi','Do','Fr','Sa','So'].map(d => `<div class="cal-dow">${d}</div>`).join('')}
    ${cells}
  </div>
  <div class="cal-legend-list" style="margin-top:12px">
    <div class="cal-legend-item">
      <span class="cal-legend-swatch" style="background:var(--accent)"></span>
      <span class="cal-legend-name">${hasRange ? 'Tourdauer' : 'Startdatum'}</span>
    </div>
    <div class="cal-legend-item">
      <span class="cal-legend-swatch" style="background:rgba(240,120,0,0.35)"></span>
      <span class="cal-legend-name">Planungstermin</span>
    </div>
  </div>
</div>`;
  }

  // Small mode: compact month block for multi-month grid
  return `
<div>
  <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
              color:var(--accent);text-align:center;margin-bottom:4px">${monthName}</div>
  <div class="cal-grid cal-grid-sm">
    ${['Mo','Di','Mi','Do','Fr','Sa','So'].map(d => `<div class="cal-dow cal-dow-sm">${d}</div>`).join('')}
    ${cells}
  </div>
</div>`;
}


/* ----------------------------------------------------------
   Profile modal body (content only; shell is the modal wrapper)
   ---------------------------------------------------------- */

async function renderProfileBody() {
  let profile = { notification_email: '', notify_chat: true, notify_changes: true };
  try { profile = await loadProfile(); } catch(e) {}

  return `
  <div class="info-block" style="margin-bottom:24px">
    <div class="info-label">Benutzername</div>
    <div style="font-size:16px;font-weight:500">${esc(state.currentUser?.username || '')}</div>
  </div>

  <div class="divider"></div>
  <h3 style="font-size:15px;font-weight:600;margin-bottom:6px">📱 App-Benachrichtigungen (Push)</h3>
  <p style="color:var(--muted);font-size:13px;margin-bottom:16px">
    Erhalte Push-Benachrichtigungen direkt auf deinem Gerät – auch ohne E-Mail.
    <span id="pwa-push-hint" style="display:block;margin-top:4px"></span>
  </p>
  <button class="btn btn-ghost" id="pwa-push-btn" style="width:100%;justify-content:center;margin-bottom:24px">
    🔔 Push-Benachrichtigungen aktivieren
  </button>

  <div class="divider"></div>
  <h3 style="font-size:15px;font-weight:600;margin-bottom:6px">🔔 E-Mail-Benachrichtigungen</h3>
  <p style="color:var(--muted);font-size:13px;margin-bottom:20px">
    Erhalte eine E-Mail, wenn du offline bist und Aktivitäten in deinen Touren stattfinden.
  </p>

  <div class="form-group">
    <label>Benachrichtigungs-E-Mail</label>
    <input type="email" id="p-email" value="${esc(profile.notification_email || '')}"
           placeholder="deine@email.de" />
    <div style="font-size:11px;color:var(--muted);margin-top:5px">
      Diese E-Mail-Adresse wird ausschliesslich für Benachrichtigungen verwendet.
    </div>
  </div>

  <div class="profile-toggle-row">
    <div>
      <div style="font-weight:500;font-size:14px">💬 Chat-Nachrichten</div>
      <div style="color:var(--muted);font-size:12px">Neue Nachrichten in deinen Touren</div>
    </div>
    <label class="toggle-switch">
      <input type="checkbox" id="p-notify-chat" ${profile.notify_chat !== false ? 'checked' : ''} />
      <span class="toggle-slider"></span>
    </label>
  </div>

  <div class="profile-toggle-row">
    <div>
      <div style="font-weight:500;font-size:14px">📋 Tour-Änderungen</div>
      <div style="color:var(--muted);font-size:12px">Änderungen an Route, Terminen, Info usw.</div>
    </div>
    <label class="toggle-switch">
      <input type="checkbox" id="p-notify-changes" ${profile.notify_changes !== false ? 'checked' : ''} />
      <span class="toggle-slider"></span>
    </label>
  </div>

  <button class="btn btn-primary" id="profile-save"
    style="width:100%;justify-content:center;padding:13px;font-size:15px;margin-top:24px">
    Einstellungen speichern
  </button>`;
}

/* Modal shell (static, rendered once in nav) */
function renderProfileModal() {
  return `
<div class="modal-overlay settings-modal-overlay" id="profile-modal" style="display:none">
  <div class="settings-modal-content">
    <div class="settings-modal-header">
      <div class="settings-modal-title">⚙️ Profil & Benachrichtigungen</div>
      <button class="btn btn-ghost btn-sm" id="profile-modal-close" title="Schliessen" style="font-size:18px;padding:6px 14px">✕</button>
    </div>
    <div class="settings-modal-body" id="profile-modal-body">
      <div style="color:var(--muted);padding:20px">Lädt…</div>
    </div>
  </div>
</div>`;
}

/* ----------------------------------------------------------
   Communities landing page
   ---------------------------------------------------------- */

function renderCommunities() {
  const list = state.communities.map(c => {
    const isMember  = state.myCommunityIds.has(c.id);
    const isAdmin   = c.admin_id === state.currentUser.id ||
                      (c.co_admin_ids || []).includes(state.currentUser.id);
    return `
<div class="card community-card" data-community-id="${c.id}">
  <div class="community-card-inner">
    <div>
      <div class="community-card-name">${esc(c.name)}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:4px">
        ${isAdmin ? '<span class="tag tag-accent" style="font-size:10px">Admin</span>' : ''}
        ${isMember ? '<span class="tag tag-muted" style="font-size:10px">✓ Mitglied</span>' : '<span class="tag tag-muted" style="font-size:10px">🔒 Passwort nötig</span>'}
      </div>
    </div>
    <button class="btn ${isMember ? 'btn-primary' : 'btn-ghost'} btn-sm" data-enter-community="${c.id}">
      ${isMember ? 'Öffnen →' : 'Beitreten'}
    </button>
  </div>
</div>`;
  }).join('');

  const empty = state.communities.length === 0
    ? '<div style="text-align:center;color:var(--muted);padding:40px">Noch keine Communities vorhanden.</div>'
    : '';

  return `
<div class="page-form" style="max-width:560px">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;flex-wrap:wrap;gap:8px">
    <div class="page-title" style="margin:0"><img src="img/logo.png" alt="" style="height:108px;vertical-align:middle;margin-right:14px" />Communities</div>
    <button class="btn btn-primary btn-sm" id="request-community-btn">+ Community beantragen</button>
  </div>
  <div class="page-sub" style="margin-bottom:28px">
    Wähle eine Community um loszulegen.
    ${state.isSiteAdminUser ? `<span class="tag tag-accent" style="margin-left:8px;font-size:11px">🛡️ Seitenadmin</span>
      <button class="btn btn-ghost btn-sm" id="toggle-admin-panel" style="margin-left:4px;font-size:11px;padding:3px 10px">⚙️ Verwalten</button>` : ''}
  </div>

  <div id="community-request-form" style="display:none;margin-bottom:24px">
    <div class="info-block" style="padding:18px">
      <div class="info-label" style="margin-bottom:12px">Neue Community beantragen</div>
      <div class="form-group">
        <label>Community Name</label>
        <input type="text" id="req-comm-name" placeholder="Name der Community" maxlength="100" />
      </div>
      <div class="form-group">
        <label>Passwort (für Beitritt)</label>
        <input type="text" id="req-comm-pw" placeholder="Beitrittspasswort" maxlength="50" />
      </div>
      <button class="btn btn-primary btn-sm" id="submit-community-request">Antrag absenden</button>
    </div>
  </div>

  ${state.isSiteAdminUser ? `<div id="admin-panel" style="display:none;margin-bottom:20px">
    <div id="pending-requests-area"></div>
    <div class="info-block" style="padding:16px">
      <div class="info-label">🛡️ Seitenadmin-Verwaltung</div>
      <div style="margin-top:8px">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <select id="add-site-admin-select" style="flex:1;min-width:160px;padding:7px 12px;font-size:13px">
            <option value="">— User auswählen —</option>
          </select>
          <button class="btn btn-primary btn-sm" id="add-site-admin-btn">+ Seitenadmin</button>
        </div>
        <div id="site-admin-list" style="margin-top:10px"></div>
      </div>
    </div>
  </div>` : ''}

  ${list}
  ${empty}
</div>`;
}

/* ----------------------------------------------------------
   Site Info Modal (Info / Changelog) — admin-editable
   ---------------------------------------------------------- */
function renderSiteInfoModal() {
  const isAdmin = !!state.isSiteAdminUser;
  return `
<div class="modal-overlay site-info-overlay" id="site-info-overlay" style="display:none">
  <div class="site-info-content">
    <div class="site-info-header">
      <div class="site-info-tabs">
        <button class="site-info-tab active" data-si-tab="changelog">📝 Changelog</button>
        <button class="site-info-tab" data-si-tab="info">ℹ️ Info</button>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        ${isAdmin ? `<button class="btn btn-ghost btn-sm" id="site-info-edit" title="Bearbeiten">✏️ Bearbeiten</button>` : ''}
        <button class="btn btn-ghost btn-sm" id="site-info-close" title="Schliessen" style="font-size:18px;padding:6px 14px">✕</button>
      </div>
    </div>
    <div class="site-info-body">
      <div class="site-info-view" id="site-info-view-info"></div>
      <div class="site-info-view" id="site-info-view-changelog" style="display:none"></div>
      <div class="site-info-edit-area" id="site-info-edit-area" style="display:none">
        <div class="site-info-edit-split">
          <div class="site-info-edit-pane">
            <div class="site-info-pane-label">Markdown</div>
            <textarea id="site-info-textarea" placeholder="# Überschrift&#10;&#10;Dein Text…"></textarea>
          </div>
          <div class="site-info-edit-pane">
            <div class="site-info-pane-label">Vorschau</div>
            <div class="site-info-view site-info-preview" id="site-info-preview"></div>
          </div>
        </div>
        <div class="site-info-edit-actions">
          <span style="font-size:12px;color:var(--muted)">Markdown: # Überschrift, **fett**, *kursiv*, - Liste, [Link](url)</span>
          <div style="display:flex;gap:8px">
            <button class="btn btn-ghost btn-sm" id="site-info-cancel">Abbrechen</button>
            <button class="btn btn-primary btn-sm" id="site-info-save">Speichern</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;
}

/* ----------------------------------------------------------
   Community Home (tour list within a community)
   ---------------------------------------------------------- */

function renderCommunityHome() {
  const community = state.currentCommunity;
  const isAdmin   = community && (
    community.admin_id === state.currentUser.id ||
    (community.co_admin_ids || []).includes(state.currentUser.id)
  );

  const myTours   = state.tours.filter(t => state.myTourIds.has(t.id));
  const otherTours = state.tours.filter(t => !state.myTourIds.has(t.id));

  const tourCards = tours => tours.map(t => renderTourCard(t, false)).join('');

  const toursHtml = state.tours.length === 0 ? `
    <div style="text-align:center;padding:60px 20px;color:var(--muted)">
      <div style="font-size:48px;margin-bottom:16px">🏍️</div>
      <div style="font-size:18px;font-weight:600;margin-bottom:8px">Noch keine Touren</div>
      <div style="font-size:14px">Erstelle die erste Tour für diese Community!</div>
    </div>` : `
    ${myTours.length > 0 ? `<div class="home-section-title">Meine Touren (${myTours.length})</div>
    <div class="tour-grid">${tourCards(myTours)}</div>` : ''}
    ${otherTours.length > 0 ? `<div class="home-section-title" style="margin-top:24px">Weitere Touren (${otherTours.length})</div>
    <div class="tour-grid">${tourCards(otherTours)}</div>` : ''}`;

  return `
<div class="home-wrap">
  <div class="home-header">
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <button class="btn btn-ghost btn-sm" id="back-communities"><span class="back-full">← Communities</span><span class="back-icon">←</span></button>
      <div class="tour-detail-title">${esc(community?.name || '')}</div>
      ${isAdmin ? `<button class="map-btn" id="community-settings-btn" title="Einstellungen">
        <span class="map-btn-icon">⚙️</span><span class="map-btn-label">Einstellungen</span>
      </button>` : ''}
      <button class="map-btn map-btn-danger" id="leave-community-btn" title="Verlassen">
        <span class="map-btn-icon">🚪</span><span class="map-btn-label">Verlassen</span>
      </button>
    </div>
    <div class="community-actions" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-ghost" id="community-media-btn" style="
        font-size:15px;font-weight:600;padding:10px 20px;position:relative;
        border:2px solid var(--accent);border-radius:8px;letter-spacing:.02em
      ">
        📸 Media
        ${(() => {
          const cm = state.mediaBadges?.community || 0;
          const tm = state.mediaBadges?.tours || 0;
          const total = cm + tm;
          if (!total) return '';
          return `<span class="tab-badge" title="${total} neue Medien" style="margin-left:6px">${total > 9 ? '9+' : total}</span>`;
        })()}
      </button>
      <button class="btn btn-ghost" id="planning-btn" style="
        font-size:15px;font-weight:600;padding:10px 20px;position:relative;
        border:2px solid var(--accent);border-radius:8px;letter-spacing:.02em
      ">
        📋 Touren Planung
        ${(() => {
          const b = state.planningBadges;
          const total = (b.chat || 0) + (b.polls || 0);
          if (!total) return '';
          const tip = [
            b.chat  ? `${b.chat} neue Nachricht${b.chat  > 1 ? 'en' : ''}` : '',
            b.polls ? `${b.polls} neue Abfrage${b.polls > 1 ? 'n' : ''}`   : '',
          ].filter(Boolean).join(', ');
          return `<span class="tab-badge" title="${tip}" style="margin-left:6px">${total > 9 ? '9+' : total}</span>`;
        })()}
      </button>
      <button class="btn btn-tet" id="tet-atlas-btn" style="
        font-size:15px;font-weight:600;padding:10px 20px;
        border-radius:8px;letter-spacing:.02em
      " title="Trans Euro Trail Atlas">
        🗺️ TET Atlas
      </button>
      <button class="btn btn-primary btn-sm" id="create-tour-btn">+ Tour erstellen</button>
    </div>
  </div>
  <div class="home-layout">
    <div>${toursHtml}</div>
    <div>${renderCalWidget()}</div>
  </div>
</div>
${renderTetAtlasModal()}`;
}

/* ----------------------------------------------------------
   TET Atlas Modal (hidden by default; toggled in events.js)
   ---------------------------------------------------------- */
function renderTetAtlasModal() {
  return `
<div class="modal-overlay tet-modal-overlay" id="tet-atlas-overlay" style="display:none">
  <div class="tet-modal-content">
    <div class="tet-modal-header">
      <div class="tet-modal-title">
        <span style="display:inline-block;width:14px;height:14px;background:#009b97;border-radius:3px;vertical-align:middle;margin-right:8px"></span>
        Trans Euro Trail Atlas
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <a href="https://atlas.transeurotrail.org" target="_blank" rel="noopener" class="btn btn-ghost btn-sm" title="In neuem Tab öffnen">
          ↗ Extern öffnen
        </a>
        <button class="btn btn-ghost btn-sm" id="tet-atlas-close" title="Schliessen" style="font-size:18px;padding:6px 14px">✕</button>
      </div>
    </div>
    <div class="tet-modal-body">
      <div id="tet-atlas-fallback" style="display:none;padding:32px;text-align:center;color:var(--muted)">
        <div style="font-size:48px;margin-bottom:16px">⚠️</div>
        <div style="font-size:16px;font-weight:600;color:var(--text);margin-bottom:8px">
          Karte konnte nicht eingebettet werden
        </div>
        <div style="font-size:14px;margin-bottom:20px;max-width:480px;margin-left:auto;margin-right:auto">
          Der TET Atlas blockiert das direkte Einbetten aus Sicherheitsgründen.
          Bitte öffne ihn in einem neuen Tab.
        </div>
        <a href="https://atlas.transeurotrail.org" target="_blank" rel="noopener" class="btn btn-primary">
          🗺️ TET Atlas extern öffnen
        </a>
      </div>
      <iframe id="tet-atlas-iframe"
              src="about:blank"
              title="TET Atlas"
              referrerpolicy="no-referrer-when-downgrade"
              allowfullscreen
              loading="lazy"
              style="border:0;width:100%;height:100%;display:block;background:#fff"></iframe>
    </div>
  </div>
</div>`;
}

/* ----------------------------------------------------------
   Community Settings (body content + modal shell)
   ---------------------------------------------------------- */

function renderCommunitySettingsBody() {
  const c       = state.currentCommunity;
  const isAdmin = c.admin_id === state.currentUser.id;

  const memberRows = state.communityMembers.map(m => {
    const isMe      = m.id === state.currentUser.id;
    const isCreator = m.id === c.admin_id;
    return `
<div class="profile-toggle-row" style="padding:10px 16px">
  <div>
    <div style="font-weight:500;font-size:14px">
      ${esc(m.username)}
      ${isCreator ? '<span class="tag tag-accent" style="font-size:10px;margin-left:4px">Admin</span>' : ''}
      ${m.isCoAdmin && !isCreator ? '<span class="tag tag-muted" style="font-size:10px;margin-left:4px">Co-Admin</span>' : ''}
    </div>
  </div>
  <div style="display:flex;gap:6px">
    ${isAdmin && !isCreator && !isMe ? `
      ${m.isCoAdmin
        ? `<button class="btn btn-ghost btn-sm" data-demote-community="${m.id}">Co-Admin entfernen</button>`
        : `<button class="btn btn-ghost btn-sm" data-promote-community="${m.id}">Co-Admin machen</button>`}
      <button class="btn btn-ghost btn-sm" style="color:var(--danger)" data-kick-community="${m.id}">Entfernen</button>
    ` : ''}
  </div>
</div>`;
  }).join('');

  return `
  <div style="color:var(--muted);font-size:14px;margin-bottom:18px">${esc(c.name)}</div>

  <div class="form-group">
    <label>Community Name</label>
    <input type="text" id="cs-name" value="${esc(c.name)}" />
  </div>
  <div class="form-group">
    <label>Passwort</label>
    <input type="text" id="cs-password" value="${esc(c.password)}" />
    <div style="font-size:11px;color:var(--muted);margin-top:4px">
      Alle neuen Mitglieder brauchen dieses Passwort zum Beitreten.
    </div>
  </div>
  <button class="btn btn-primary btn-sm" id="cs-save" style="margin-bottom:32px">Speichern</button>

  <div class="divider"></div>
  <h3 style="font-size:15px;font-weight:600;margin-bottom:16px">👥 Mitglieder (${state.communityMembers.length})</h3>
  <div style="display:flex;flex-direction:column;gap:6px">
    ${memberRows}
  </div>`;
}

/* Modal shell (static, rendered once in nav) */
function renderCommunitySettingsModal() {
  return `
<div class="modal-overlay settings-modal-overlay" id="community-settings-modal" style="display:none">
  <div class="settings-modal-content">
    <div class="settings-modal-header">
      <div class="settings-modal-title">🛡️ Community Einstellungen</div>
      <button class="btn btn-ghost btn-sm" id="community-settings-modal-close" title="Schliessen" style="font-size:18px;padding:6px 14px">✕</button>
    </div>
    <div class="settings-modal-body" id="community-settings-modal-body">
      <div style="color:var(--muted);padding:20px">Lädt…</div>
    </div>
  </div>
</div>`;
}

/* ----------------------------------------------------------
   Create Community form
   ---------------------------------------------------------- */

function renderCreateCommunity() {
  return `
<div class="page-form" style="max-width:480px">
  <button class="btn btn-ghost btn-sm" style="margin-bottom:24px" id="back-communities">← Zurück</button>
  <div class="page-title">Community erstellen</div>
  <div class="page-sub">Gründe eine neue Community. Du wirst automatisch Admin.</div>

  <div class="form-group">
    <label>Name *</label>
    <input type="text" id="cc-name" placeholder="z.B. Alpen Rider" maxlength="60" />
  </div>
  <div class="form-group">
    <label>Passwort *</label>
    <input type="text" id="cc-password" placeholder="Passwort für neue Mitglieder" maxlength="40" />
    <div style="font-size:11px;color:var(--muted);margin-top:4px">
      Neue Mitglieder brauchen dieses Passwort zum Beitreten.
    </div>
  </div>
  <button class="btn btn-primary" id="cc-submit"
    style="width:100%;justify-content:center;padding:13px;font-size:15px;margin-top:8px">
    Community anlegen →
  </button>
</div>`;
}

/* ==============================================================
   PLANNING PAGE
   ============================================================== */

function renderPlanning() {
  const tabs = [
    { id: 'polls', label: '📋 Abfragen' },
    { id: 'map',   label: '🗺️ Karte'    },
    { id: 'chat',  label: '💬 Chat'     },
    { id: 'log',   label: '📝 Log'      },
  ];

  const tabBar = tabs.map(t => `
    <button class="tab-btn plan-tab-btn ${state.planningTab === t.id ? 'active' : ''}" data-plan-tab="${t.id}">
      ${t.label}
    </button>`).join('');

  let tabContent = '';
  switch (state.planningTab) {
    case 'polls': tabContent = renderPlanPolls();   break;
    case 'map':   tabContent = renderPlanMap();     break;
    case 'chat':  tabContent = renderPlanChat();    break;
    case 'log':   tabContent = renderPlanLog();     break;
  }

  return `
<div class="tour-detail">
  <div class="tour-detail-header">
    <button class="btn btn-ghost btn-sm" id="back-community-home">← ${esc(state.currentCommunity?.name || 'Community')}</button>
    <div class="tour-detail-title">📋 Touren Planung</div>
  </div>
  <div class="tour-tabs">${tabBar}</div>
  <div class="tab-content" id="plan-tab-content">
    ${tabContent}
  </div>
</div>`;
}

/* ── Polls tab ─────────────────────────────────────────────── */

function renderPlanPolls() {
  const isAdmin = state.currentCommunity &&
    (state.currentCommunity.admin_id === state.currentUser.id ||
     (state.currentCommunity.co_admin_ids || []).includes(state.currentUser.id));

  const currentYear = new Date().getFullYear();

  const createForm = isAdmin ? `
<div style="margin-bottom:16px">
  <button class="btn btn-primary btn-sm" id="poll-toggle-form">+ Neue Abfrage</button>
</div>
<div class="card" id="poll-create-form" style="margin-bottom:20px;padding:18px 20px;display:none">
  <div style="font-size:14px;font-weight:600;margin-bottom:12px">Neue Abfrage erstellen</div>

  <div class="form-row" style="margin-bottom:10px">
    <div class="form-group" style="margin-bottom:0">
      <label style="font-size:12px">Typ</label>
      <select id="poll-type">
        <option value="general">Allgemeine Abfrage</option>
        <option value="yearly">Jahresplanung</option>
      </select>
    </div>
    <div class="form-group" id="poll-year-wrap" style="margin-bottom:0;display:none">
      <label style="font-size:12px">Jahr</label>
      <select id="poll-year">
        <option value="${currentYear}">${currentYear}</option>
        <option value="${currentYear + 1}">${currentYear + 1}</option>
        <option value="${currentYear + 2}">${currentYear + 2}</option>
      </select>
    </div>
  </div>

  <div class="form-group" style="margin-bottom:10px">
    <input type="text" id="poll-question" placeholder="Frage / Titel eingeben…" maxlength="200" />
  </div>

  <div id="poll-options-list" style="margin-bottom:10px">
    <div class="poll-option-row">
      <input type="text" class="poll-option-input" placeholder="Option 1" />
      <span class="poll-option-dates" style="display:none">
        <input type="date" class="poll-date-start" style="width:130px" />
        <span style="color:var(--muted);font-size:12px">–</span>
        <input type="date" class="poll-date-end" style="width:130px" />
      </span>
    </div>
    <div class="poll-option-row" style="margin-top:6px">
      <input type="text" class="poll-option-input" placeholder="Option 2" />
      <span class="poll-option-dates" style="display:none">
        <input type="date" class="poll-date-start" style="width:130px" />
        <span style="color:var(--muted);font-size:12px">–</span>
        <input type="date" class="poll-date-end" style="width:130px" />
      </span>
    </div>
  </div>
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">
    <button class="btn btn-ghost btn-sm" id="poll-add-option">+ Option hinzufügen</button>
    <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
      <input type="checkbox" id="poll-multi" />
      Mehrfachauswahl erlauben
    </label>
  </div>
  <button class="btn btn-primary btn-sm" id="poll-submit">Abfrage erstellen</button>
</div>` : '';

  // Yearly polls pinned to top, sorted by year desc
  const yearlyPolls  = state.communityPolls.filter(p => p.poll_type === 'yearly')
    .sort((a, b) => (b.poll_year || 0) - (a.poll_year || 0));
  const generalPolls = state.communityPolls.filter(p => p.poll_type !== 'yearly');

  const yearlyHtml = yearlyPolls.length ? `
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;
                color:var(--accent);margin-bottom:10px">📅 Jahresplanung</div>
    ${yearlyPolls.map(p => renderPollCard(p, isAdmin)).join('')}
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;
                color:var(--muted);margin:16px 0 10px">💬 Allgemeine Abfragen</div>` : '';

  const generalHtml = generalPolls.length === 0 && yearlyPolls.length === 0
    ? '<div style="text-align:center;color:var(--muted);padding:40px">Noch keine Abfragen vorhanden.</div>'
    : generalPolls.map(p => renderPollCard(p, isAdmin)).join('');

  const pollsHtml = yearlyHtml + generalHtml;

  return `<div class="plan-polls-scroll"><div class="plan-polls-layout">
    <div class="plan-polls-main">${createForm}${pollsHtml}</div>
    <div class="plan-polls-sidebar">${renderPlanYearCal()}</div>
  </div></div>`;
}

function renderPollCard(poll, isAdmin) {
  const myVote    = poll.votes.find(v => v.user_id === state.currentUser.id);
  const myOptIds  = myVote?.option_ids || [];
  const totalVotes = poll.votes.length;

  const optionsHtml = poll.options.map(opt => {
    const count  = poll.votes.filter(v => (v.option_ids || []).includes(opt.id)).length;
    const pct    = totalVotes ? Math.round(count / totalVotes * 100) : 0;
    const voted  = myOptIds.includes(opt.id);
    const isYearly = poll.poll_type === 'yearly';

    // Build date label for yearly options
    let dateLabel = '';
    if (isYearly && opt.date_start && opt.date_end) {
      const ds = new Date(opt.date_start + 'T12:00:00');
      const de = new Date(opt.date_end   + 'T12:00:00');
      const kw = getISOWeek(ds);
      const fmt = d => d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'2-digit' });
      dateLabel = `<div style="font-size:11px;color:var(--muted);margin-top:2px">
        KW${kw} · ${fmt(ds)} – ${fmt(de)}
      </div>`;
    }

    // Who voted for this option
    const voters = poll.votes
      .filter(v => (v.option_ids || []).includes(opt.id))
      .map(v => v.username);
    const votersHtml = voters.length
      ? `<div style="font-size:10px;color:var(--muted);margin-top:3px;padding-left:26px">
           ${voters.map(u => `<span style="display:inline-block;background:var(--border);border-radius:10px;padding:0 6px;margin:1px 2px;line-height:1.8">${esc(u)}</span>`).join('')}
         </div>`
      : '';

    return `
<div class="poll-option ${voted ? 'poll-option-voted' : ''}" data-poll-id="${poll.id}" data-opt-id="${opt.id}"
     style="cursor:${poll.closed ? 'default' : 'pointer'}">
  <div class="poll-option-bar" style="width:${myVote || poll.closed ? pct : 0}%"></div>
  <div class="poll-option-inner">
    <div style="display:flex;align-items:center;gap:8px;flex:1">
      <span class="poll-option-check ${voted ? 'poll-option-check-on' : ''}">${voted ? '✓' : ''}</span>
      <div>
        <div>${esc(opt.text)}</div>
        ${dateLabel}
      </div>
    </div>
    ${myVote || poll.closed ? `<span style="font-size:12px;color:var(--muted);white-space:nowrap">${count} (${pct}%)</span>` : ''}
  </div>
  ${votersHtml}
</div>`;
  }).join('');

  const dt       = new Date(poll.created_at);
  const dateStr  = dt.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' });
  const canAdmin = isAdmin || poll.user_id === state.currentUser.id;

  return `
<div class="card" style="margin-bottom:14px;padding:18px 20px" id="poll-${poll.id}">
  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:14px">
    <div>
      <div style="font-size:15px;font-weight:600">${esc(poll.question)}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">
        ${esc(poll.username)} · ${dateStr}
        ${poll.multi ? ' · Mehrfachauswahl' : ''}
        ${poll.closed ? ' · <span style="color:var(--accent)">Geschlossen</span>' : ''}
      </div>
    </div>
    ${canAdmin ? `
    <div style="display:flex;gap:4px;flex-shrink:0">
      ${!poll.closed ? `<button class="btn btn-ghost btn-sm" onclick="window._openPollEdit('${poll.id}')" title="Bearbeiten">✏️</button>` : ''}
      ${!poll.closed ? `<button class="btn btn-ghost btn-sm" data-close-poll="${poll.id}">🔒</button>` : ''}
      <button class="btn btn-ghost btn-sm" style="color:var(--danger)" data-delete-poll="${poll.id}">🗑️</button>
    </div>` : ''}
  </div>
  <div class="poll-options">${optionsHtml}</div>
  <div style="font-size:11px;color:var(--muted);margin-top:10px">${totalVotes} Stimme${totalVotes !== 1 ? 'n' : ''}</div>
  ${!poll.closed && myVote ? `<button class="btn btn-ghost btn-sm" style="margin-top:8px;font-size:12px" data-reset-vote="${poll.id}">Auswahl zurücksetzen</button>` : ''}
</div>`;
}

/* ── Plan Map tab ──────────────────────────────────────────── */

function renderPlanMap() {
  const tours = state.communityToursGpx || [];

  // Use same color index as the calendar: position in state.tours
  const getTourColor = (tourId, fallbackIdx) => {
    const idxInAll = (state.tours || []).findIndex(t => t.id === tourId);
    const i = idxInAll >= 0 ? idxInAll : fallbackIdx;
    return TOUR_PALETTE[i % TOUR_PALETTE.length];
  };

  const toggles = tours.length === 0
    ? '<div style="color:var(--muted);font-size:13px;padding:8px 0">Keine Routen vorhanden.</div>'
    : tours.map((t, i) => {
        const visible = state.planMapVisible[t.id] !== false;
        const color   = getTourColor(t.id, i);

        let kwLabel = '';
        if (t.date) {
          const d  = new Date(t.date + 'T12:00:00');
          const kw = getISOWeek(d);
          kwLabel = '<span style="display:inline-flex;align-items:center;justify-content:center;min-width:36px;padding:1px 5px;border-radius:4px;font-size:10px;font-weight:700;flex-shrink:0;background:' + color + '22;color:' + color + ';border:1px solid ' + color + '44">KW' + kw + '</span>';
        }

        return '<div class="map-sidebar-item" style="gap:6px;align-items:center">'
          + '<input type="checkbox" class="plan-track-toggle" data-tour-id="' + t.id + '"'
          + (visible ? ' checked' : '')
          + ' style="accent-color:' + color + ';width:15px;height:15px;cursor:pointer;flex-shrink:0" />'
          + kwLabel
          + '<span class="map-sidebar-dot" style="background:' + color + ';flex-shrink:0"></span>'
          + '<span class="map-sidebar-label" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;color:' + color + '">' + esc(t.name) + '</span>'
          + '</div>';
      }).join('');

  return `
<div class="map-layout">
  <div id="plan-map-container" style="height:100%;position:relative">
    <div id="plan-map" style="height:100%"></div>
    <div class="map-controls">
      <button class="map-btn" id="plan-map-fullscreen">
        <span class="map-btn-icon" id="plan-fs-icon">⛶</span>
        <span class="map-btn-label" id="plan-fs-label">Vollbild</span>
      </button>
    </div>
  </div>
  <div class="map-sidebar" style="width:360px;min-width:360px">
    <div class="map-sidebar-section">
      <div class="map-sidebar-title">Touren anzeigen</div>
      ${toggles}
    </div>
  </div>
</div>`;
}

/* ── Plan Chat tab ─────────────────────────────────────────── */

function renderPlanChat() {
  const msgs = state.communityMessages;
  const msgsHtml = msgs.length === 0
    ? `<div style="flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;color:var(--muted);font-size:14px;text-align:center">
         <div style="font-size:36px">💬</div>
         <p>Noch keine Nachrichten in der Community.</p>
       </div>`
    : msgs.map(m => {
        const isMe = m.user_id === state.currentUser.id;
        const dt = new Date(m.created_at);
        const time = dt.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });
        const date = dt.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'2-digit' });
        return `
<div class="chat-msg ${isMe ? 'mine' : ''}">
  <div class="chat-bubble">${esc(m.text)}</div>
  <div class="chat-meta">${esc(m.username)} · ${date}, ${time}</div>
</div>`;
      }).join('');

  return `
<div class="chat-layout">
  <div class="chat-messages" id="plan-chat-msgs">${msgsHtml}</div>
  <div class="chat-input-bar">
    <button class="emoji-toggle-btn" id="plan-emoji-toggle" title="Emoji">😊</button>
    <input type="text" id="plan-chat-input" placeholder="Nachricht…" maxlength="1000" />
    <button class="btn btn-primary" id="plan-chat-send">Senden</button>
  </div>
  <div class="emoji-picker" id="plan-emoji-picker" style="display:none"></div>
</div>`;
}

/* ── Plan Log tab ──────────────────────────────────────────── */

function renderPlanLog() {
  const log = state.communityChangelog;

  if (!log.length) {
    return `<div class="plan-polls-scroll"><div style="padding:40px;text-align:center;color:var(--muted)">
      <div style="font-size:40px;margin-bottom:12px">📝</div>
      <div style="font-family:var(--font-display);font-size:22px;letter-spacing:1px;color:var(--text);margin-bottom:6px">Noch keine Einträge</div>
      <div style="font-size:13px">Änderungen werden hier automatisch protokolliert.</div>
    </div></div>`;
  }

  const iconFor = field => {
    if (field.includes('Abfrage') || field.includes('Abstimmung') || field.includes('Jahresplanung')) return '📋';
    if (field.includes('Route')) return '🗺️';
    if (field.includes('Admin')) return '👑';
    return '📝';
  };

  const rows = log.map(e => {
    const dt   = new Date(e.created_at);
    const date = dt.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'2-digit' });
    const time = dt.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });

    const hasOld = e.old_value && e.old_value !== '';
    const hasNew = e.new_value && e.new_value !== '';

    let changeHtml = '';
    if (hasOld && hasNew) {
      changeHtml = `<span class="cl-old">${esc(e.old_value)}</span>
                    <span class="cl-arrow">→</span>
                    <span class="cl-new">${esc(e.new_value)}</span>`;
    } else if (hasNew) {
      changeHtml = `<span class="cl-new">+ ${esc(e.new_value)}</span>`;
    } else if (hasOld) {
      changeHtml = `<span class="cl-old">− ${esc(e.old_value)}</span>`;
    }

    return `<div class="cl-row">
      <div class="cl-meta">
        <span style="font-size:15px;line-height:1">${iconFor(e.field)}</span>
        <span class="cl-user">${esc(e.username)}</span>
        <span class="cl-time">${date}, ${time}</span>
      </div>
      <div class="cl-field">${esc(e.field)}</div>
      <div class="cl-change">${changeHtml}</div>
    </div>`;
  }).join('');

  return `<div class="plan-polls-scroll"><div style="padding:24px;max-width:760px">
    <h2 style="font-family:var(--font-display);font-size:28px;letter-spacing:1px;margin-bottom:20px">Planung Log</h2>
    <div class="cl-list">${rows}</div>
  </div></div>`;
}

/* ----------------------------------------------------------
   Planning Year Calendar
   ---------------------------------------------------------- */

function renderPlanYearCal() {
  if (!state.planCalYear) state.planCalYear = new Date().getFullYear();
  const y     = state.planCalYear;
  const today = new Date();

  // Build tour date ranges from all community tours
  const tours = state.tours || [];
  const tourRanges = tours.map((t, i) => ({
    name:  t.name,
    color: TOUR_PALETTE[i % TOUR_PALETTE.length],
    start: new Date(t.date + 'T12:00:00'),
    end:   t.end_date ? new Date(t.end_date + 'T12:00:00') : new Date(t.date + 'T12:00:00'),
    isTour: true,
  }));

  // Build ranges from yearly poll options (distinct teal color)
  const PLAN_COLOR = '#00bcd4';
  const yearlyPolls = (state.communityPolls || []).filter(p => p.poll_type === 'yearly' && p.poll_year === y);
  const planRanges = [];
  yearlyPolls.forEach(poll => {
    (poll.options || []).forEach(opt => {
      if (opt.date_start && opt.date_end) {
        planRanges.push({
          name:   opt.text || poll.question,
          color:  PLAN_COLOR,
          start:  new Date(opt.date_start + 'T12:00:00'),
          end:    new Date(opt.date_end   + 'T12:00:00'),
          isPlan: true,
        });
      }
    });
  });

  const allRanges = [...tourRanges, ...planRanges];

  const MONTH_NAMES = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  const DAY_NAMES   = ['Mo','Di','Mi','Do','Fr','Sa','So'];

  let monthsHtml = '';

  for (let m = 0; m < 12; m++) {
    const days      = daysInMonth(y, m);
    const firstDay  = (new Date(y, m, 1).getDay() + 6) % 7; // 0=Mon
    const monthStart = new Date(y, m, 1);
    const monthEnd   = new Date(y, m, days);

    // Build dayMap for this month
    const dayMap = {};
    allRanges.forEach(tr => {
      if (tr.start > monthEnd || tr.end < monthStart) return;
      const cur = new Date(Math.max(tr.start, monthStart));
      cur.setHours(12, 0, 0, 0);
      const lim = new Date(Math.min(tr.end, monthEnd));
      lim.setHours(12, 0, 0, 0);
      while (cur <= lim) {
        const dn = cur.getDate();
        if (!dayMap[dn]) dayMap[dn] = [];
        dayMap[dn].push(tr);
        cur.setDate(cur.getDate() + 1);
        cur.setHours(12, 0, 0, 0);
      }
    });

    // Week header
    const weekHeader = `<div class="ycal-kw-cell"></div>` +
      DAY_NAMES.map(d => `<div class="ycal-head">${d}</div>`).join('');

    // Two-row-per-week approach: numbers row + events row with grid-column spanning
    const total = Math.ceil((firstDay + days) / 7) * 7;
    let rowsHtml = '';

    for (let i = 0; i < total; i += 7) {
      // ISO week number
      const rowDay  = i - firstDay + 1;
      const rowDate = rowDay >= 1 && rowDay <= days
        ? new Date(y, m, rowDay)
        : rowDay < 1 ? new Date(y, m, 1) : new Date(y, m, days);
      const mon = new Date(rowDate);
      mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
      const kw = getISOWeek(mon);

      // Numbers row
      let numCells = `<div class="ycal-kw-cell" title="KW ${kw}">
        <span style="font-size:9px;color:var(--muted)">KW${kw}</span>
      </div>`;

      for (let j = 0; j < 7; j++) {
        const dn      = i + j - firstDay + 1;
        const inM     = dn >= 1 && dn <= days;
        const isToday = inM && today.getDate() === dn && today.getMonth() === m && today.getFullYear() === y;
        const toursHere = inM ? (dayMap[dn] || []) : [];
        const bg = toursHere.filter(t=>t.isTour)[0]?.color
          ? `background:${toursHere.filter(t=>t.isTour)[0].color}22;`
          : toursHere.filter(t=>t.isPlan)[0]?.color
            ? `background:${toursHere.filter(t=>t.isPlan)[0].color}15;`
            : '';
        const title = toursHere.map(t => t.name).join(', ');
        numCells += `<div class="ycal-day${isToday ? ' ycal-today' : ''}${!inM ? ' ycal-out' : ''}"
          style="${bg}" title="${esc(title)}">${inM ? dn : ''}</div>`;
      }

      // Events row: find all events that START in this week row
      // Collect unique events visible in this week
      const weekEvents = { tour: [], plan: [] };
      for (let j = 0; j < 7; j++) {
        const dn = i + j - firstDay + 1;
        if (dn < 1 || dn > days) continue;
        (dayMap[dn] || []).forEach(item => {
          const arr = item.isTour ? weekEvents.tour : weekEvents.plan;
          if (!arr.find(e => e.name === item.name)) {
            // Find start column (1-based, 1=Mon) in this week
            let startCol = j + 1; // already 0-based j
            // Go back to find actual start in this week
            for (let k = j - 1; k >= 0; k--) {
              const kdn = i + k - firstDay + 1;
              if (kdn >= 1 && (dayMap[kdn] || []).find(x => x.name === item.name)) {
                startCol = k + 1;
              } else break;
            }
            // Find end column
            let endCol = j + 1;
            for (let k = j + 1; k < 7; k++) {
              const kdn = i + k - firstDay + 1;
              if (kdn >= 1 && kdn <= days && (dayMap[kdn] || []).find(x => x.name === item.name)) {
                endCol = k + 1;
              } else break;
            }
            arr.push({ name: item.name, color: item.color, startCol, endCol });
          }
        });
      }

      let eventCells = '';
      const allWeekEvents = [...weekEvents.tour, ...weekEvents.plan];
      if (allWeekEvents.length > 0) {
        eventCells = '<div></div>'; // KW spacer
        // Build a 7-slot grid, place events
        // Use grid-column: startCol+1 / endCol+2 (offset by 1 for KW col)
        allWeekEvents.forEach(ev => {
          const textColor = ev.color === '#00bcd4' ? '#003' : '#000';
          eventCells += `<div class="ycal-event-bar" title="${esc(ev.name)}"
            style="grid-column:${ev.startCol + 1} / ${ev.endCol + 2};background:${ev.color};color:${textColor}">
            ${esc(ev.name)}
          </div>`;
        });
      }

      const eventsRow = allWeekEvents.length > 0
        ? `<div class="ycal-events-row">${eventCells}</div>`
        : '';

      rowsHtml += `<div class="ycal-num-row">${numCells}</div>${eventsRow}`;
    }

    monthsHtml += `
<div class="ycal-month">
  <div class="ycal-month-name">${MONTH_NAMES[m]}</div>
  <div class="ycal-grid-header">${weekHeader}</div>
  <div class="ycal-rows">${rowsHtml}</div>
</div>`;
  }

  // Tour legend
  const tourLegend = tourRanges.map(t => `
<div class="cal-legend-item" style="margin-bottom:4px">
  <span class="cal-legend-swatch" style="background:${t.color}"></span>
  <span class="cal-legend-name">${esc(t.name)}</span>
</div>`).join('');

  const planLegend = planRanges.length ? `
<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
            color:#00bcd4;margin:8px 0 4px">Jahresplanung ${y}</div>` +
  planRanges.map(p => `
<div class="cal-legend-item" style="margin-bottom:4px">
  <span class="cal-legend-swatch" style="background:#00bcd4"></span>
  <span class="cal-legend-name">${esc(p.name)}</span>
</div>`).join('') : '';

  const legend = (tourLegend + planLegend) ||
    `<span style="color:var(--muted);font-size:11px">Keine Touren</span>`;

  return `
<div class="ycal-wrap">
  <div class="ycal-header">
    <button class="cal-nav-btn" id="ycal-prev">‹</button>
    <div class="cal-title">${y}</div>
    <button class="cal-nav-btn" id="ycal-next">›</button>
  </div>
  <div class="ycal-months">${monthsHtml}</div>
</div>`;
}

/* ----------------------------------------------------------
   Poll edit modal
   ---------------------------------------------------------- */

function renderPollEditModal(poll) {
  const isYearly = poll.poll_type === 'yearly';
  const optRows  = poll.options.map((opt, i) => `
<div class="poll-option-row" data-opt-id="${opt.id}">
  <input type="text" class="poll-edit-opt-text" value="${esc(opt.text)}" placeholder="Option ${i+1}" />
  ${isYearly ? `<span class="poll-option-dates" style="display:inline-flex">
    <input type="date" class="poll-edit-date-start" value="${opt.date_start || ''}" style="width:130px" />
    <span style="color:var(--muted);font-size:12px">–</span>
    <input type="date" class="poll-edit-date-end" value="${opt.date_end || ''}" style="width:130px" />
  </span>` : ''}
  <button class="btn btn-ghost btn-sm poll-edit-remove-opt" style="color:var(--danger);flex-shrink:0">✕</button>
</div>`).join('');

  return `
<div class="modal-overlay" id="poll-edit-overlay">
  <div class="card" style="width:560px;max-width:95vw;max-height:85vh;overflow-y:auto;padding:24px;position:relative">
    <div style="font-size:15px;font-weight:600;margin-bottom:16px">Abfrage bearbeiten</div>

    <div class="form-group">
      <label>Frage</label>
      <input type="text" id="poll-edit-question" value="${esc(poll.question)}" maxlength="200" />
    </div>

    <div style="font-size:13px;font-weight:600;margin-bottom:8px;margin-top:4px">Optionen</div>
    <div id="poll-edit-options">${optRows}</div>
    <button class="btn btn-ghost btn-sm" id="poll-edit-add-opt" style="margin-bottom:16px;margin-top:6px">+ Option hinzufügen</button>

    <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;margin-bottom:16px">
      <input type="checkbox" id="poll-edit-multi" ${poll.multi ? 'checked' : ''} />
      Mehrfachauswahl erlauben
    </label>

    <div style="display:flex;gap:8px">
      <button class="btn btn-primary" id="poll-edit-save" data-poll-id="${poll.id}">Speichern</button>
      <button class="btn btn-ghost" id="poll-edit-cancel">Abbrechen</button>
    </div>
  </div>
</div>`;
}

/* ----------------------------------------------------------
   Media Tab (Cloudinary + YouTube)
   ---------------------------------------------------------- */

function renderMediaTab() {
  const media = [...state.tourMedia].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (a.sort_order || 0) - (b.sort_order || 0) || new Date(b.created_at) - new Date(a.created_at));
  const images = media.filter(m => m.media_type === 'image');
  const videos = media.filter(m => m.media_type === 'video');
  const ytVideos = media.filter(m => m.media_type === 'youtube');

  const uploadSection = `
<div class="media-upload-bar">
  <label class="btn btn-primary btn-sm" for="media-file-input" style="cursor:pointer">
    📷 Bild / Video hochladen
  </label>
  <input type="file" id="media-file-input" accept="image/*,video/mp4,video/quicktime,video/webm"
    style="display:none" multiple />
  <button class="btn btn-ghost btn-sm" id="media-yt-btn">▶️ YouTube Link hinzufügen</button>
  <div id="media-yt-form" style="display:none;margin-left:8px;display:none;align-items:center;gap:8px">
    <input type="text" id="media-yt-url" placeholder="YouTube URL einfügen…" style="width:280px;padding:7px 12px;font-size:13px" />
    <input type="text" id="media-yt-caption" placeholder="Beschreibung (optional)" style="width:180px;padding:7px 12px;font-size:13px" />
    <button class="btn btn-primary btn-sm" id="media-yt-add">Hinzufügen</button>
  </div>
</div>
<div id="media-upload-progress" style="display:none;padding:8px 20px">
  <div style="display:flex;align-items:center;gap:12px">
    <div class="spinner"></div>
    <span id="media-upload-text">Wird hochgeladen… 0%</span>
  </div>
  <div style="height:4px;background:var(--border);border-radius:2px;margin-top:6px">
    <div id="media-upload-bar" style="height:100%;background:var(--accent);border-radius:2px;width:0%;transition:width 0.2s"></div>
  </div>
</div>`;

  const emptyState = media.length === 0
    ? `<div style="text-align:center;padding:60px 20px;color:var(--muted)">
         <div style="font-size:48px;margin-bottom:16px">📸</div>
         <div style="font-size:18px;font-weight:600;margin-bottom:8px;color:var(--text)">Noch keine Medien</div>
         <div style="font-size:14px">Lade Bilder oder Videos hoch oder füge YouTube-Links hinzu.</div>
       </div>`
    : '';

  const galleryItems = media.map(m => {
    const isMe = m.user_id === state.currentUser.id;
    const isAdmin = isCurrentUserAdmin();
    const canDelete = isMe || isAdmin;
    const dt = new Date(m.created_at);
    const dateStr = dt.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'2-digit' });

    if (m.media_type === 'image') {
      // Cloudinary thumbnail: 400px wide, auto height, auto quality
      const thumb = m.url.replace('/upload/', '/upload/c_fill,w_400,h_300,q_auto/');
      return `
<div class="media-card" data-media-id="${m.id}" ${isAdmin ? 'draggable="true"' : ''}>
  <div class="media-thumb" style="cursor:pointer" data-lightbox-url="${m.url}" data-lightbox-type="image">
    ${m.pinned ? '<div class="media-pinned-badge">📌</div>' : ''}
    <img src="${thumb}" alt="${esc(m.caption || '')}" loading="lazy" />
  </div>
  <div class="media-card-footer">
    <div class="media-card-info">
      <span class="media-card-user">${esc(m.username)}</span>
      <span class="media-card-date">${dateStr}</span>
    </div>
    ${m.caption ? `<div class="media-card-caption">${esc(m.caption)}</div>` : ''}
    ${isAdmin ? `<button class="media-pin-btn${m.pinned ? ' pinned' : ''}" data-pin-media="${m.id}" data-pinned="${m.pinned ? '1' : '0'}" title="${m.pinned ? 'Loslösen' : 'Anpinnen'}">${m.pinned ? '📌' : '📍'}</button>` : ''}
    ${canDelete ? `<button class="media-delete-btn" data-delete-media="${m.id}" title="Löschen">🗑️</button>` : ''}
  </div>
</div>`;
    }

    if (m.media_type === 'video') {
      const thumb = m.thumbnail_url || m.url.replace('/upload/', '/upload/c_fill,w_400,h_300,so_1/');
      return `
<div class="media-card" data-media-id="${m.id}" ${isAdmin ? 'draggable="true"' : ''}>
  <div class="media-thumb" style="cursor:pointer;position:relative" data-lightbox-url="${m.url}" data-lightbox-type="video">
    ${m.pinned ? '<div class="media-pinned-badge">📌</div>' : ''}
    <img src="${thumb}" alt="${esc(m.caption || '')}" loading="lazy" />
    <div class="media-play-overlay">▶</div>
  </div>
  <div class="media-card-footer">
    <div class="media-card-info">
      <span class="media-card-user">${esc(m.username)}</span>
      <span class="media-card-date">${dateStr}</span>
    </div>
    ${m.caption ? `<div class="media-card-caption">${esc(m.caption)}</div>` : ''}
    ${isAdmin ? `<button class="media-pin-btn${m.pinned ? ' pinned' : ''}" data-pin-media="${m.id}" data-pinned="${m.pinned ? '1' : '0'}" title="${m.pinned ? 'Loslösen' : 'Anpinnen'}">${m.pinned ? '📌' : '📍'}</button>` : ''}
    ${canDelete ? `<button class="media-delete-btn" data-delete-media="${m.id}" title="Löschen">🗑️</button>` : ''}
  </div>
</div>`;
    }

    if (m.media_type === 'youtube') {
      const ytId = parseYouTubeUrl(m.url);
      const thumb = m.thumbnail_url || `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
      return `
<div class="media-card" data-media-id="${m.id}" ${isAdmin ? 'draggable="true"' : ''}>
  <div class="media-thumb" style="cursor:pointer;position:relative" data-lightbox-url="${m.url}" data-lightbox-type="youtube" data-yt-id="${ytId}">
    ${m.pinned ? '<div class="media-pinned-badge">📌</div>' : ''}
    <img src="${thumb}" alt="${esc(m.caption || '')}" loading="lazy" />
    <div class="media-play-overlay">▶</div>
  </div>
  <div class="media-card-footer">
    <div class="media-card-info">
      <span class="media-card-user">${esc(m.username)}</span>
      <span class="media-card-date">${dateStr}</span>
    </div>
    ${m.caption ? `<div class="media-card-caption">${esc(m.caption)}</div>` : ''}
    ${canDelete ? `<button class="media-delete-btn" data-delete-media="${m.id}" title="Löschen">🗑️</button>` : ''}
    ${isAdmin ? `<button class="media-pin-btn${m.pinned ? ' pinned' : ''}" data-pin-media="${m.id}" data-pinned="${m.pinned ? '1' : '0'}" title="${m.pinned ? 'Loslösen' : 'Anpinnen'}">${m.pinned ? '📌' : '📍'}</button>` : ''}
  </div>
</div>`;
    }

    return '';
  }).join('');

  const gallery = media.length > 0
    ? `<div class="media-gallery">${galleryItems}</div>`
    : '';

  return `<div class="tab-scroll"><div style="padding:0 0 24px">
    ${uploadSection}
    ${emptyState}
    ${gallery}
  </div></div>`;
}

/* Lightbox */
function renderMediaLightbox(url, type, ytId, mediaId) {
  let content = '';
  if (type === 'image') {
    content = `<img src="${url}" style="max-width:85vw;max-height:85vh;border-radius:8px" />`;
  } else if (type === 'video') {
    content = `<video src="${url}" controls autoplay style="max-width:85vw;max-height:85vh;border-radius:8px"></video>`;
  } else if (type === 'youtube') {
    content = `<iframe src="https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&rel=0&modestbranding=1"
      style="width:min(85vw,960px);height:min(50vw,540px);border:none;border-radius:8px"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerpolicy="strict-origin-when-cross-origin"
      allowfullscreen></iframe>`;
  }

  return `<div class="modal-overlay" id="media-lightbox" data-current-id="${mediaId || ''}">
    <button class="lightbox-nav-btn lightbox-prev" id="lightbox-prev" title="Vorheriges">‹</button>
    <button class="lightbox-nav-btn lightbox-next" id="lightbox-next" title="Nächstes">›</button>
    <button style="position:absolute;top:16px;right:20px;background:none;border:none;color:#fff;
      font-size:32px;cursor:pointer;z-index:10" id="lightbox-close">✕</button>
    <div id="lightbox-content" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%">
      ${content}
    </div>
  </div>`;
}

/* ----------------------------------------------------------
   Community Media Page
   ---------------------------------------------------------- */

function renderCommunityMedia() {
  const tours = state.tours || [];
  const isAdmin = state.currentCommunity &&
    (state.currentCommunity.admin_id === state.currentUser.id ||
     (state.currentCommunity.co_admin_ids || []).includes(state.currentUser.id));

  // Tour list sidebar
  const tourList = tours.length === 0
    ? '<div style="color:var(--muted);font-size:13px;padding:12px">Keine Touren vorhanden.</div>'
    : tours.map(t => {
        const d = t.date ? new Date(t.date + 'T12:00:00') : null;
        const kw = d ? `KW${getISOWeek(d)}` : '';
        const year = d ? d.getFullYear() : '';
        const selected = state.selectedTourMedia === t.id;
        const count = state.tourMediaCounts?.[t.id] || 0;
        const newCount = state.tourMediaNew?.[t.id] || 0;
        return `<div class="cm-tour-item${selected ? ' cm-tour-selected' : ''}" data-cm-tour="${t.id}">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
            <div class="cm-tour-name">${esc(t.name)}</div>
            <div style="display:flex;align-items:center;gap:4px">
              ${newCount > 0 ? `<span class="tab-badge" style="font-size:10px;min-width:16px;height:16px;padding:0 4px" title="${newCount} neu">${newCount}</span>` : ''}
              ${count > 0 ? `<span class="cm-tour-count">${count} 📸</span>` : ''}
            </div>
          </div>
          <div class="cm-tour-meta">${kw} ${year}</div>
        </div>`;
      }).join('');

  // Right side: community YouTube library
  const cmMedia = [...state.communityMedia].sort((a, b) =>
    (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (a.sort_order || 0) - (b.sort_order || 0)
  );

  const ytUpload = isAdmin ? `
<div class="media-upload-bar" style="border-bottom:1px solid var(--border)">
  <button class="btn btn-ghost btn-sm" id="cm-yt-btn">▶️ YouTube Link hinzufügen</button>
  <div id="cm-yt-form" style="display:none;align-items:center;gap:8px;margin-left:8px">
    <input type="text" id="cm-yt-url" placeholder="YouTube URL…" style="width:260px;padding:7px 12px;font-size:13px" />
    <input type="text" id="cm-yt-caption" placeholder="Beschreibung (optional)" style="width:160px;padding:7px 12px;font-size:13px" />
    <button class="btn btn-primary btn-sm" id="cm-yt-add">Hinzufügen</button>
  </div>
</div>` : '';

  const cmGallery = cmMedia.length === 0
    ? `<div style="text-align:center;padding:40px;color:var(--muted)">
         <div style="font-size:36px;margin-bottom:8px">📸</div>
         <div>Noch keine Community-Medien. YouTube-Links hinzufügen!</div>
       </div>`
    : `<div class="media-gallery">${cmMedia.map(m => _renderCommunityMediaCard(m, isAdmin)).join('')}</div>`;

  return `
<div class="tour-detail">
  <div class="tour-detail-header">
    <button class="btn btn-ghost btn-sm" id="back-community-home-media">← ${esc(state.currentCommunity?.name || 'Community')}</button>
    <div class="tour-detail-title">📸 Media</div>
  </div>
  <div class="cm-layout">
    <div class="cm-sidebar">
      <div class="cm-sidebar-header">Touren Media</div>
      <div class="cm-tour-list">${tourList}</div>
    </div>
    <div class="cm-main" id="cm-main-content">
      <div class="cm-section-header">Community Bibliothek</div>
      ${ytUpload}
      ${cmGallery}
    </div>
  </div>
</div>`;
}

function _renderCommunityMediaCard(m, isAdmin) {
  const ytId = parseYouTubeUrl(m.url);
  const thumb = m.thumbnail_url || (ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : '');
  const dt = new Date(m.created_at);
  const dateStr = dt.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'2-digit' });
  const isMe = m.user_id === state.currentUser.id;
  const canDelete = isMe || isAdmin;

  return `
<div class="media-card" data-media-id="${m.id}" ${isAdmin ? 'draggable="true"' : ''}>
  <div class="media-thumb" style="cursor:pointer;position:relative" data-cm-lightbox-url="${m.url}" data-cm-lightbox-type="youtube" data-cm-yt-id="${ytId || ''}">
    ${m.pinned ? '<div class="media-pinned-badge">📌</div>' : ''}
    <img src="${thumb}" alt="${esc(m.caption || '')}" loading="lazy" />
    <div class="media-play-overlay">▶</div>
  </div>
  <div class="media-card-footer">
    <div class="media-card-info">
      <span class="media-card-user">${esc(m.username)}</span>
      <span class="media-card-date">${dateStr}</span>
    </div>
    ${m.caption ? `<div class="media-card-caption">${esc(m.caption)}</div>` : ''}
    ${isAdmin ? `<button class="media-pin-btn${m.pinned ? ' pinned' : ''}" data-cm-pin="${m.id}" data-pinned="${m.pinned ? '1' : '0'}" title="${m.pinned ? 'Loslösen' : 'Anpinnen'}">${m.pinned ? '📌' : '📍'}</button>` : ''}
    ${canDelete ? `<button class="media-delete-btn" data-cm-delete="${m.id}" title="Löschen">🗑️</button>` : ''}
  </div>
</div>`;
}

function renderTourMediaPreview(media) {
  if (!media.length) {
    return '<div style="text-align:center;padding:40px;color:var(--muted)">Keine Medien in dieser Tour.</div>';
  }

  const gallery = media.map(m => {
    const dt = new Date(m.created_at);
    const dateStr = dt.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'2-digit' });

    if (m.media_type === 'image') {
      const thumb = m.url.replace('/upload/', '/upload/c_fill,w_400,h_300,q_auto/');
      return `<div class="media-card" data-media-id="${m.id}"><div class="media-thumb" style="cursor:pointer" data-cm-lightbox-url="${m.url}" data-cm-lightbox-type="image">
        ${m.pinned ? '<div class="media-pinned-badge">📌</div>' : ''}
        <img src="${thumb}" loading="lazy" /></div>
        <div class="media-card-footer"><div class="media-card-info"><span class="media-card-user">${esc(m.username)}</span><span class="media-card-date">${dateStr}</span></div>
        ${m.caption ? `<div class="media-card-caption">${esc(m.caption)}</div>` : ''}</div></div>`;
    }
    if (m.media_type === 'video') {
      const thumb = m.thumbnail_url || m.url.replace('/upload/', '/upload/c_fill,w_400,h_300,so_1/');
      return `<div class="media-card" data-media-id="${m.id}"><div class="media-thumb" style="cursor:pointer;position:relative" data-cm-lightbox-url="${m.url}" data-cm-lightbox-type="video">
        ${m.pinned ? '<div class="media-pinned-badge">📌</div>' : ''}
        <img src="${thumb}" loading="lazy" /><div class="media-play-overlay">▶</div></div>
        <div class="media-card-footer"><div class="media-card-info"><span class="media-card-user">${esc(m.username)}</span><span class="media-card-date">${dateStr}</span></div>
        ${m.caption ? `<div class="media-card-caption">${esc(m.caption)}</div>` : ''}</div></div>`;
    }
    if (m.media_type === 'youtube') {
      const ytId = parseYouTubeUrl(m.url);
      const thumb = m.thumbnail_url || `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
      return `<div class="media-card" data-media-id="${m.id}"><div class="media-thumb" style="cursor:pointer;position:relative" data-cm-lightbox-url="${m.url}" data-cm-lightbox-type="youtube" data-cm-yt-id="${ytId}">
        ${m.pinned ? '<div class="media-pinned-badge">📌</div>' : ''}
        <img src="${thumb}" loading="lazy" /><div class="media-play-overlay">▶</div></div>
        <div class="media-card-footer"><div class="media-card-info"><span class="media-card-user">${esc(m.username)}</span><span class="media-card-date">${dateStr}</span></div>
        ${m.caption ? `<div class="media-card-caption">${esc(m.caption)}</div>` : ''}</div></div>`;
    }
    return '';
  }).join('');

  return `<div class="media-gallery">${gallery}</div>`;
}
