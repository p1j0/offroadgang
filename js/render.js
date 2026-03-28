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
  <div class="nav-logo" id="nav-logo">MOTO<span>ROUTE</span></div>
  <div class="nav-user">
    🏍️ <strong>${esc(state.currentUser?.username || '')}</strong>
    <button class="btn-logout" id="logout-btn">Abmelden</button>
  </div>
</nav>`;
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
  const isAdmin  = tour.admin_id === state.currentUser.id;
  const isMine   = state.myTourIds.has(tour.id);
  const dateStr  = date.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
  const adminName = state.profileCache[tour.admin_id] || '…';

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
    <span style="font-size:12px;color:var(--muted)">von ${esc(adminName)}</span>
    ${isMine
      ? `<button class="btn btn-primary btn-sm" data-open-id="${tour.id}">Öffnen →</button>`
      : `<button class="btn btn-ghost btn-sm"   data-join-id="${tour.id}">Beitreten</button>`}
  </div>
</div>`;
}

/* ----------------------------------------------------------
   Home calendar widget
   ---------------------------------------------------------- */

function renderCalWidget() {
  const y = state.calMonth.getFullYear();
  const m = state.calMonth.getMonth();

  const days     = daysInMonth(y, m);
  const firstDay = (new Date(y, m, 1).getDay() + 6) % 7;
  const today    = new Date();

  // Collect tour dates for the current user
  const tourDates = new Set();
  state.tours
    .filter(t => state.myTourIds.has(t.id))
    .forEach(t => {
      const d = new Date(t.date + 'T12:00:00');
      if (d.getFullYear() === y && d.getMonth() === m) tourDates.add(d.getDate());
    });

  const monthName = state.calMonth.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  const total     = Math.ceil((firstDay + days) / 7) * 7;

  let cells = '';
  for (let i = 0; i < total; i++) {
    const dn   = i - firstDay + 1;
    const inM  = dn >= 1 && dn <= days;
    const isToday  = inM && today.getDate() === dn && today.getMonth() === m && today.getFullYear() === y;
    const hasTour  = inM && tourDates.has(dn);
    const cls = ['cal-day', !inM && 'other-month', isToday && 'today', hasTour && 'has-tour']
      .filter(Boolean).join(' ');
    cells += `<div class="${cls}">${inM ? dn : ''}</div>`;
  }

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
  <div class="cal-legend">
    <span><span class="cal-legend-dot" style="background:rgba(240,120,0,0.25)"></span> Tour-Termin</span>
  </div>
</div>`;
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
  <div class="page-sub">Lege eine neue Motorrad-Tour an. Du bist automatisch Admin und legst das Beitrittspasswort fest.</div>

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
    <div class="form-group">
      <label>Geschätzte Distanz</label>
      <input type="text" id="f-dist" placeholder="z.B. 350 km" maxlength="30" />
    </div>
  </div>
  <div class="form-group">
    <label>Beitritts-Passwort *</label>
    <input type="password" id="f-pw" placeholder="Passwort für neue Mitglieder" maxlength="40" />
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

  const isAdmin = tour.admin_id === state.currentUser.id;
  const tabs    = [
    { id: 'map',          label: '🗺️ Karte' },
    { id: 'chat',         label: '💬 Chat' },
    { id: 'participants', label: '👥 Teilnehmer' },
    { id: 'info',         label: '📋 Info & Kalender' },
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
    </div>
  </div>

  <div class="tour-tabs">
    ${tabs.map(t => `
      <button class="tab-btn ${state.currentTab === t.id ? 'active' : ''}" data-tab="${t.id}">
        ${t.label}
      </button>`).join('')}
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
    case 'participants': return renderParticipantsTab();
    case 'info':         return renderInfoTab(tour);
    default: return '';
  }
}

/* ----------------------------------------------------------
   Map tab
   ---------------------------------------------------------- */

function renderMapTab(tour) {
  const hasRoute = tour.gpx_route?.length > 0;
  const isAdmin  = tour.admin_id === state.currentUser.id;

  return `
<div id="map-container">
  <div id="map"></div>
  <div class="map-controls">
    ${isAdmin ? `
    <label class="map-btn" for="gpx-up" style="cursor:pointer">
      📁 GPX hochladen
      <input type="file" id="gpx-up" accept=".gpx" style="display:none" />
    </label>` : ''}
    ${hasRoute ? `<button class="map-btn" id="gpx-dl">⬇️ GPX herunterladen</button>` : ''}
    ${hasRoute && isAdmin ? `<button class="map-btn map-btn-danger" id="gpx-del">🗑️ Route löschen</button>` : ''}
  </div>
  <div class="map-info">
    ${hasRoute
      ? `<span>📍 Route geladen</span><span>📏 Punkte: <strong>${tour.gpx_route.length}</strong></span>`
      : `<span>${isAdmin ? 'Keine Route — GPX-Datei hochladen um die Route anzuzeigen' : 'Admin hat noch keine Route hochgeladen'}</span>`}
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
          const time = new Date(m.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
          return `
<div class="chat-msg ${mine ? 'mine' : ''}">
  <div class="chat-bubble">${esc(m.text)}</div>
  <div class="chat-meta">${esc(m.username)} · ${time}</div>
</div>`;
        }).join('')}
  </div>
  <div class="chat-input-bar">
    <input type="text" id="chat-in" placeholder="Nachricht schreiben…" maxlength="500" />
    <button class="btn btn-primary" id="chat-send">Senden</button>
  </div>
</div>`;
}

/* ----------------------------------------------------------
   Participants tab
   ---------------------------------------------------------- */

function renderParticipantsTab() {
  return `
<div class="tab-scroll">
  <div class="participants-layout">
    <div style="margin-bottom:22px">
      <h2 style="font-family:var(--font-display);font-size:30px;letter-spacing:1px">
        Teilnehmer (${state.tourMembers.length})
      </h2>
    </div>
    ${state.tourMembers.map(m => `
    <div class="participant-item">
      <div class="participant-avatar">${(m.username || '?')[0].toUpperCase()}</div>
      <div>
        <div style="font-weight:500">${esc(m.username)}</div>
        <div style="font-size:12px;color:var(--muted)">${m.isAdmin ? 'Admin & Ersteller' : 'Mitfahrer'}</div>
      </div>
      ${m.user_id === state.currentUser.id
        ? '<span class="tag tag-accent" style="margin-left:auto">Du</span>'
        : ''}
    </div>`).join('')}
  </div>
</div>`;
}

/* ----------------------------------------------------------
   Info & calendar tab
   ---------------------------------------------------------- */

function renderInfoTab(tour) {
  const isAdmin = tour.admin_id === state.currentUser.id;

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
            <div class="info-label">Distanz</div>
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
          <label>Ziel / Region</label>
          <input type="text" id="edit-dest" value="${esc(tour.destination || '')}" />
        </div>
        <div class="form-group">
          <label>Distanz</label>
          <input type="text" id="edit-dist" value="${esc(tour.distance || '')}" />
        </div>
        <div class="form-group">
          <label>Beschreibung</label>
          <textarea id="edit-desc">${esc(tour.description || '')}</textarea>
        </div>
        <button class="btn btn-primary btn-sm" id="edit-save">Änderungen speichern</button>
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
  const y = state.tourCalMonth.getFullYear();
  const m = state.tourCalMonth.getMonth();

  const days     = daysInMonth(y, m);
  const firstDay = (new Date(y, m, 1).getDay() + 6) % 7;
  const today    = new Date();

  // Plan dates in this month
  const planSet = new Set();
  state.tourPlanDates.forEach(pd => {
    const d = new Date(pd.date + 'T12:00:00');
    if (d.getFullYear() === y && d.getMonth() === m) planSet.add(d.getDate());
  });

  // Tour start date
  const tourD       = new Date(tour.date + 'T12:00:00');
  const tourInMonth = tourD.getFullYear() === y && tourD.getMonth() === m;

  const total  = Math.ceil((firstDay + days) / 7) * 7;
  const monthName = state.tourCalMonth.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

  let cells = '';
  for (let i = 0; i < total; i++) {
    const dn  = i - firstDay + 1;
    const inM = dn >= 1 && dn <= days;

    const isToday   = inM && today.getDate() === dn && today.getMonth() === m && today.getFullYear() === y;
    const hasPlan   = inM && planSet.has(dn);
    const isTourDay = tourInMonth && inM && tourD.getDate() === dn;

    const cls   = ['cal-day', !inM && 'other-month', isToday && 'today', hasPlan && 'has-tour'].filter(Boolean).join(' ');
    const style = isTourDay ? ' style="background:var(--accent)!important;color:#000!important;font-weight:700"' : '';

    cells += `<div class="${cls}"${style}>${inM ? dn : ''}</div>`;
  }

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
  <div class="cal-legend">
    <span><span class="cal-legend-dot" style="background:var(--accent)"></span> Startdatum</span>
    <span><span class="cal-legend-dot" style="background:rgba(240,120,0,0.25)"></span> Planungstermin</span>
  </div>
</div>`;
}
