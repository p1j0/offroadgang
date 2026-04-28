/* ============================================================
   events.js – DOM event attachment
   Depends on: all other modules (called at runtime via globals)
   ============================================================ */

/* --- Calendar view toggle globals --- */
window._setCalView = (v) => {
  state.calView = v;
  render();
};

window._setPlanCalView = (v) => {
  state.planCalView = v;
  const sidebar = document.querySelector('.plan-polls-sidebar');
  if (sidebar) { sidebar.innerHTML = renderPlanYearCal(); attachPlanningContentEvents(); }
};

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
  document.getElementById('nav-logo')?.addEventListener('click', () => navigateTo('communities'));

  /* Avatar dropdown */
  const avatarBtn = document.getElementById('nav-avatar-btn');
  const avatarDropdown = document.getElementById('nav-avatar-dropdown');
  if (avatarBtn && avatarDropdown) {
    avatarBtn.addEventListener('click', e => {
      e.stopPropagation();
      avatarDropdown.hidden = !avatarDropdown.hidden;
    });
    document.addEventListener('click', e => {
      if (!avatarDropdown.hidden && !avatarDropdown.contains(e.target) && e.target !== avatarBtn) {
        avatarDropdown.hidden = true;
      }
    });
    // Close dropdown when an item inside is clicked
    avatarDropdown.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', () => { avatarDropdown.hidden = true; });
    });
  }

  document.getElementById('go-profile')?.addEventListener('click', () => openProfileModal());
  document.getElementById('logout-btn')?.addEventListener('click', doLogout);

  /* --- Profile modal close --- */
  document.getElementById('profile-modal-close')?.addEventListener('click', closeProfileModal);
  document.getElementById('profile-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'profile-modal') closeProfileModal();
  });

  /* --- Community settings modal close --- */
  document.getElementById('community-settings-modal-close')?.addEventListener('click', closeCommunitySettingsModal);
  document.getElementById('community-settings-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'community-settings-modal') closeCommunitySettingsModal();
  });

  /* --- Generic "back" buttons --- */
  document.querySelectorAll('#back-home').forEach(el => {
    el.addEventListener('click', () => {
      if (state.currentCommunityId && state.currentCommunity) {
        navigateTo('community-home');
      } else {
        navigateTo('communities');
      }
    });
  });

  /* --- Home buttons --- */
  document.getElementById('go-create')?.addEventListener('click', () => navigateTo('create'));
  document.getElementById('go-join')?.addEventListener('click',   () => navigateTo('join'));

  /* --- Community: request button on landing --- */
  document.getElementById('request-community-btn')?.addEventListener('click', () => {
    const form = document.getElementById('community-request-form');
    if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
  });

  document.getElementById('submit-community-request')?.addEventListener('click', async () => {
    const name = document.getElementById('req-comm-name')?.value.trim();
    const pw   = document.getElementById('req-comm-pw')?.value.trim();
    if (!name) { toast('Bitte Namen eingeben', 'error'); return; }
    if (!pw)   { toast('Bitte Passwort eingeben', 'error'); return; }
    try {
      await submitCommunityRequest(name, pw);
      toast('✓ Antrag eingereicht! Der Seitenadmin wird benachrichtigt.');
      document.getElementById('community-request-form').style.display = 'none';
    } catch (e) { toast(e.message, 'error'); }
  });

  /* --- Site Info / Changelog modal --- */
  document.getElementById('site-info-btn')?.addEventListener('click', () => openSiteInfoModal());
  document.getElementById('site-info-close')?.addEventListener('click', closeSiteInfoModal);
  document.getElementById('site-info-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'site-info-overlay') closeSiteInfoModal();
  });
  document.querySelectorAll('.site-info-tab').forEach(tab => {
    tab.addEventListener('click', () => switchSiteInfoTab(tab.dataset.siTab));
  });
  document.getElementById('site-info-edit')?.addEventListener('click', enterSiteInfoEditMode);
  document.getElementById('site-info-cancel')?.addEventListener('click', exitSiteInfoEditMode);
  document.getElementById('site-info-save')?.addEventListener('click', saveSiteInfoEdit);
  document.getElementById('site-info-textarea')?.addEventListener('input', updateSiteInfoPreview);

  /* --- Site Admin panel --- */
  if (state.isSiteAdminUser) {
    /* Toggle admin panel */
    document.getElementById('toggle-admin-panel')?.addEventListener('click', () => {
      const panel = document.getElementById('admin-panel');
      if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });

    const area = document.getElementById('pending-requests-area');
    if (area) {
      loadCommunityRequests().then(requests => {
        if (!requests.length) { area.innerHTML = ''; return; }
        area.innerHTML = `
          <div class="info-block" style="margin-bottom:16px;padding:16px;border-color:var(--accent)">
            <div class="info-label" style="color:var(--accent)">⏳ Ausstehende Anträge (${requests.length})</div>
            ${requests.map(r => `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
                <div>
                  <strong>${esc(r.name)}</strong>
                  <div style="font-size:11px;color:var(--muted)">von ${esc(r.username)} · ${new Date(r.created_at).toLocaleDateString('de-DE')}</div>
                </div>
                <div style="display:flex;gap:6px">
                  <button class="btn btn-primary btn-sm" data-approve-req="${r.id}">✓</button>
                  <button class="btn btn-danger btn-sm" data-reject-req="${r.id}">✕</button>
                </div>
              </div>
            `).join('')}
          </div>`;

        document.querySelectorAll('[data-approve-req]').forEach(btn => {
          btn.addEventListener('click', async () => {
            try {
              await approveCommunityRequest(btn.dataset.approveReq);
              toast('✓ Community genehmigt und erstellt');
              await navigateTo('communities');
            } catch (e) { toast(e.message, 'error'); }
          });
        });
        document.querySelectorAll('[data-reject-req]').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (!confirm('Antrag wirklich ablehnen?')) return;
            try {
              await rejectCommunityRequest(btn.dataset.rejectReq);
              toast('Antrag abgelehnt');
              btn.closest('div[style]').remove();
            } catch (e) { toast(e.message, 'error'); }
          });
        });
      });
    }

    /* --- Site Admin list + user dropdown --- */
    const adminList = document.getElementById('site-admin-list');
    const adminSelect = document.getElementById('add-site-admin-select');
    const deleteSelect = document.getElementById('delete-user-select');

    if (adminList && adminSelect) {
      Promise.all([loadSiteAdmins(), loadAllUsers()]).then(([admins, allUsers]) => {
        // Render current admin list
        adminList.innerHTML = admins.map(a => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
            <span style="font-size:13px"><strong>${esc(a.username)}</strong>${a.user_id === state.currentUser.id ? ' <span style="color:var(--muted);font-size:11px">(du)</span>' : ''}</span>
            ${a.user_id !== state.currentUser.id ? `<button class="btn btn-danger btn-sm" style="padding:3px 8px;font-size:11px" data-remove-admin="${a.user_id}">Entfernen</button>` : ''}
          </div>
        `).join('');

        // Populate site-admin dropdown — exclude existing admins
        const adminIds = new Set(admins.map(a => a.user_id));
        const available = allUsers.filter(u => !adminIds.has(u.id));
        available.forEach(u => {
          const opt = document.createElement('option');
          opt.value = u.id;
          opt.textContent = u.username;
          adminSelect.appendChild(opt);
        });

        // Populate delete-user dropdown — all users except self
        if (deleteSelect) {
          allUsers
            .filter(u => u.id !== state.currentUser.id)
            .forEach(u => {
              const opt = document.createElement('option');
              opt.value = u.id;
              opt.textContent = u.username;
              deleteSelect.appendChild(opt);
            });
        }

        document.querySelectorAll('[data-remove-admin]').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (!confirm('Seitenadmin-Rechte entfernen?')) return;
            try {
              await removeSiteAdmin(btn.dataset.removeAdmin);
              toast('Entfernt');
              await navigateTo('communities');
            } catch (e) { toast(e.message, 'error'); }
          });
        });
      });
    }

    document.getElementById('add-site-admin-btn')?.addEventListener('click', async () => {
      const select = document.getElementById('add-site-admin-select');
      const userId = select?.value;
      if (!userId) { toast('Bitte einen User auswählen', 'error'); return; }
      const username = select.options[select.selectedIndex]?.textContent;
      try {
        await sb.from('site_admins').insert({ user_id: userId });
        toast(`✓ ${username} ist jetzt Seitenadmin`);
        await navigateTo('communities');
      } catch (e) { toast(e.message, 'error'); }
    });

    /* --- Delete user --- */
    document.getElementById('delete-user-btn')?.addEventListener('click', async () => {
      const sel = document.getElementById('delete-user-select');
      const userId = sel?.value;
      if (!userId) { toast('Bitte einen User auswählen', 'error'); return; }
      const username = sel.options[sel.selectedIndex]?.textContent || userId;
      const confirmed = confirm(
        `⚠️ User „${username}" wirklich DAUERHAFT löschen?\n\n` +
        `Alle Mitgliedschaften und der Login werden gelöscht.\n` +
        `Nachrichten bleiben als [gelöscht] erhalten.\n\n` +
        `Diese Aktion kann NICHT rückgängig gemacht werden!`
      );
      if (!confirmed) return;
      // Double-confirmation for safety
      const typed = prompt(`Zur Bestätigung den Benutzernamen eingeben:\n„${username}"`);
      if (typed?.trim() !== username.trim()) { toast('Benutzername stimmt nicht überein – abgebrochen.', 'error'); return; }
      const btn = document.getElementById('delete-user-btn');
      setBtn('delete-user-btn', true, 'Löschen…');
      try {
        await deleteUserAccount(userId);
        toast(`✓ User „${username}" wurde gelöscht`);
        await navigateTo('communities');
      } catch (e) {
        toast(e.message, 'error');
        setBtn('delete-user-btn', false);
      }
    });
  }

  /* --- Create community form submit (keep for site admin direct create) --- */
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

  /* --- TET Atlas button: open modal with iframe --- */
  document.getElementById('tet-atlas-btn')?.addEventListener('click', () => {
    const overlay  = document.getElementById('tet-atlas-overlay');
    const iframe   = document.getElementById('tet-atlas-iframe');
    const fallback = document.getElementById('tet-atlas-fallback');
    if (!overlay || !iframe) return;

    // reset state
    fallback.style.display = 'none';
    iframe.style.display   = 'block';
    overlay.style.display  = 'flex';
    document.body.style.overflow = 'hidden';

    let loaded = false;
    iframe.onload = () => { loaded = true; };
    iframe.src = 'https://atlas.transeurotrail.org';

    // If iframe didn't fire load within 4s, assume it was blocked (X-Frame-Options/CSP)
    setTimeout(() => {
      if (!loaded) {
        iframe.style.display   = 'none';
        fallback.style.display = 'block';
      }
    }, 4000);
  });

  /* --- TET Atlas modal: close --- */
  document.getElementById('tet-atlas-close')?.addEventListener('click', () => {
    const overlay = document.getElementById('tet-atlas-overlay');
    const iframe  = document.getElementById('tet-atlas-iframe');
    if (overlay) overlay.style.display = 'none';
    if (iframe)  iframe.src = 'about:blank'; // stop loading / free memory
    document.body.style.overflow = '';
  });

  /* --- TET Atlas modal: close on backdrop click --- */
  document.getElementById('tet-atlas-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'tet-atlas-overlay') {
      document.getElementById('tet-atlas-close')?.click();
    }
  });

  /* --- Community Media button --- */
  document.getElementById('community-media-btn')?.addEventListener('click', () => navigateTo('community-media'));

  /* --- Community Media page events --- */
  document.getElementById('back-community-home-media')?.addEventListener('click', () => navigateTo('community-home'));
  if (state.view === 'community-media') attachCommunityMediaEvents();

  /* --- Planning page events (if on planning view) --- */
  if (state.view === 'planning') attachPlanningEvents();

  /* --- Community home: open tour card --- */
  document.querySelectorAll('[data-open-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      navigateTo('tour', { currentTourId: btn.dataset.openId, currentTab: 'overview' });
    });
  });

  /* --- Community home: join tour (no password needed anymore) --- */
  document.querySelectorAll('[data-join-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await joinTour(btn.dataset.joinId);
        await navigateTo('tour', { currentTourId: btn.dataset.joinId, currentTab: 'overview' });
      } catch (e) { toast(e.message, 'error'); }
    });
  });

  /* --- Check-in toggle --- */
  document.querySelectorAll('.checkin-toggle-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tourId = btn.dataset.checkinId;
      if (!tourId) return;
      btn.disabled = true;
      try {
        await toggleCheckin(tourId);
        render();
      } catch (e) {
        toast('Check-in fehlgeschlagen: ' + e.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  });

  /* --- Check-in weather forecast (async, community-home view) --- */
  if (state.view === 'community-home') {
    const nextTour = (state.tours || [])
      .filter(t => {
        const end = t.end_date && t.end_date !== t.date ? t.end_date : t.date;
        return new Date(end + 'T23:59:59') >= new Date();
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date))[0];
    const treffpunktLink = (state.tourPlanDates || []).find(pd => pd.type === 'treffpunkt' && pd.maps_link)?.maps_link;
    if (nextTour?.destination || treffpunktLink) {
      _loadCheckinWeather(nextTour.id, nextTour.destination, nextTour.date, nextTour.end_date || nextTour.date, treffpunktLink);
    }
  }

  /* --- Community: create tour button --- */
  document.getElementById('create-tour-btn')?.addEventListener('click', () => navigateTo('create'));

  /* --- Community: 3-dot menu toggle --- */
  const communityMenuBtn = document.getElementById('community-menu-btn');
  const communityMenu    = document.getElementById('community-menu');
  if (communityMenuBtn && communityMenu) {
    communityMenuBtn.addEventListener('click', e => {
      e.stopPropagation();
      communityMenu.hidden = !communityMenu.hidden;
    });
    document.addEventListener('click', e => {
      if (!communityMenu.hidden && !communityMenu.contains(e.target) && e.target !== communityMenuBtn) {
        communityMenu.hidden = true;
      }
    });
  }

  /* --- Community: leave --- */
  document.getElementById('leave-community-btn')?.addEventListener('click', async () => {
    if (!confirm('Community wirklich verlassen?')) return;
    try {
      await leaveCommunity();
      toast('Community verlassen.');
      await navigateTo('communities');
    } catch (e) { toast(e.message, 'error'); }
  });

  /* --- Community: settings button → open modal --- */
  document.getElementById('community-settings-btn')?.addEventListener('click', () =>
    openCommunitySettingsModal()
  );

  /* Copy invite link */
  document.querySelectorAll('[data-copy-id]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      copyTourLink(el.dataset.copyId);
    });
  });

  /* Tour: 3-dot menu toggle */
  const tourMenuBtn = document.getElementById('tour-menu-btn');
  const tourMenu    = document.getElementById('tour-menu');
  if (tourMenuBtn && tourMenu) {
    tourMenuBtn.addEventListener('click', e => {
      e.stopPropagation();
      tourMenu.hidden = !tourMenu.hidden;
    });
    document.addEventListener('click', e => {
      if (!tourMenu.hidden && !tourMenu.contains(e.target) && e.target !== tourMenuBtn) {
        tourMenu.hidden = true;
      }
    });
  }

  /* Leave tour (non-admin members) — in header */
  document.getElementById('leave-tour-btn')?.addEventListener('click', async () => {
    const name = state.currentTour?.name || 'diese Tour';
    if (!confirm('Tour "' + name + '" wirklich verlassen?')) return;
    try {
      await leaveTour();
      toast('Du hast die Tour verlassen.');
      await navigateTo('community-home');
    } catch (e) { toast(e.message, 'error'); }
  });

  /* Open / join from tour card buttons */
  document.querySelectorAll('[data-open-id]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      navigateTo('tour', { currentTourId: el.dataset.openId, currentTab: 'overview' });
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
      if (state.myTourIds.has(id)) navigateTo('tour', { currentTourId: id, currentTab: 'overview' });
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

  /* --- Home calendar year-view navigation --- */
  document.getElementById('home-ycal-prev')?.addEventListener('click', () => {
    if (!state.calMonth) state.calMonth = new Date();
    state.calMonth = new Date(state.calMonth.getFullYear() - 1, 0, 1);
    render();
  });
  document.getElementById('home-ycal-next')?.addEventListener('click', () => {
    if (!state.calMonth) state.calMonth = new Date();
    state.calMonth = new Date(state.calMonth.getFullYear() + 1, 0, 1);
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
      await navigateTo('tour', { currentTourId: t.id, currentTab: 'overview' });
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
      await navigateTo('tour', { currentTourId: id, currentTab: 'overview' });
    } catch (e) {
      toast(e.message, 'error');
      setBtn('join-submit', false, 'Beitreten →');
    }
  });

  /* --- Participants: promote / demote --- */
  attachParticipantEvents();

  /* --- Tour tabs (only wire up when on tour view) --- */
  /* --- Overview cards → switch to the target tab --- */
  document.querySelectorAll('[data-go-tab]').forEach(card => {
    card.addEventListener('click', async () => {
      const tab = card.dataset.goTab;
      if (!tab) return;
      state.currentTab = tab;
      if (tab === 'chat')      await loadMessages();
      if (tab === 'changelog') await loadChangelog();
      markTabSeen(state.currentTourId, tab);
      computeTabBadges(state.currentTourId);
      _refreshTabBar();
      const tc = document.getElementById('tab-content');
      if (tc && state.currentTour) { tc.innerHTML = renderTab(state.currentTour); afterTabRender(); }
    });
  });

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
  if (state.currentTab === 'overview') {
    // Re-attach card click handlers (attachEvents() only runs on full render)
    document.querySelectorAll('[data-go-tab]').forEach(card => {
      card.addEventListener('click', async () => {
        const tab = card.dataset.goTab;
        if (!tab) return;
        state.currentTab = tab;
        if (tab === 'chat')      await loadMessages();
        if (tab === 'changelog') await loadChangelog();
        markTabSeen(state.currentTourId, tab);
        computeTabBadges(state.currentTourId);
        _refreshTabBar();
        const tc = document.getElementById('tab-content');
        if (tc && state.currentTour) { tc.innerHTML = renderTab(state.currentTour); afterTabRender(); }
      });
    });
    setTimeout(() => _initOverviewMap(), 80);
  }
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
  if (state.currentTab === 'media') {
    attachMediaEvents();
  }
  if (state.currentTab === 'participants') {
    attachParticipantEvents();
  }
}

/**
 * Re-render only the tab bar (to update badges) without touching tab content.
 */
function _initOverviewMap() {
  const container = document.getElementById('tov-mini-map');
  if (!container) return;

  // Destroy previous instance if still mounted
  if (window._tovMapInstance) {
    try { window._tovMapInstance.remove(); } catch (e) {}
    window._tovMapInstance = null;
  }

  const gpxData = normalizeGPXRoute(state.currentTour?.gpx_route);
  if (!gpxData?.tracks?.length) return;

  const map = L.map(container, {
    zoomControl:       false,
    dragging:          false,
    scrollWheelZoom:   false,
    doubleClickZoom:   false,
    boxZoom:           false,
    keyboard:          false,
    tap:               false,
    touchZoom:         false,
    attributionControl: false,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    opacity: 0.85,
  }).addTo(map);

  const allLatLngs = [];
  gpxData.tracks.forEach((t, i) => {
    const color = t.color || TRACK_COLORS[i % TRACK_COLORS.length];
    const pts   = (t.points || []).map(p => [p[0], p[1]]);
    if (pts.length) {
      L.polyline(pts, { color, weight: 3.5, opacity: 0.95 }).addTo(map);
      allLatLngs.push(...pts);
    }
  });

  if (allLatLngs.length) {
    map.fitBounds(L.latLngBounds(allLatLngs), { padding: [20, 20] });
  }

  window._tovMapInstance = map;
}

function _refreshTabBar() {
  const tour = state.currentTour;
  if (!tour) return;
  const tabs = [
    { id: 'overview',     label: '⊞' },
    { id: 'map',          label: 'Karte' },
    { id: 'chat',         label: 'Chat' },
    { id: 'media',        label: 'Media' },
    { id: 'participants', label: 'Teilnehmer' },
    { id: 'info',         label: 'Info' },
    { id: 'changelog',    label: 'Log' },
  ];
  const bar = document.querySelector('.tour-tabs');
  if (!bar) return;
  bar.innerHTML = renderTourTabs(tabs, state.currentTourId);
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
  bar.querySelectorAll('[data-copy-id]').forEach(el => {
    el.addEventListener('click', () => copyInviteLink(el.dataset.copyId));
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
  const isPlan = container.id === 'plan-map-container';
  const icon  = document.getElementById(isPlan ? 'plan-fs-icon'  : 'map-fs-icon');
  const label = document.getElementById(isPlan ? 'plan-fs-label' : 'map-fs-label');
  if (icon)  icon.textContent  = isFs ? '✕' : '⛶';
  if (label) label.textContent = isFs ? 'Vollbild beenden' : 'Vollbild';
  setTimeout(() => {
    mapInstance?.invalidateSize();
    _planMapInstance?.invalidateSize();
  }, 200);
}

function attachMapEvents() {
  /* Fullscreen toggle — CSS-based for mobile compatibility (iOS Safari
     does not support requestFullscreen on non-video elements) */
  document.getElementById('map-fullscreen')?.addEventListener('click', () => {
    const container = document.getElementById('map-container');
    if (!container) return;
    const isFs = container.classList.contains('map-fullscreen-active');
    if (!isFs) {
      if (document.fullscreenEnabled && container.requestFullscreen) {
        // After promise resolves, verify fullscreen actually activated.
        // On iOS 16.4+, requestFullscreen() may resolve but silently do nothing.
        container.requestFullscreen()
          .then(() => {
            // Two rAFs = ~33ms — enough to check if fullscreenElement was set
            requestAnimationFrame(() => requestAnimationFrame(() => {
              if (!document.fullscreenElement) _cssFullscreen(container, true);
            }));
          })
          .catch(() => _cssFullscreen(container, true));
      } else {
        _cssFullscreen(container, true);
      }
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen?.();
      } else {
        _cssFullscreen(container, false);
      }
    }
  });
  document.getElementById('map-container')?.addEventListener('fullscreenchange', () => {
    const container = document.getElementById('map-container');
    if (!container) return;
    _updateFsUi(container, !!document.fullscreenElement);
  });
  document.getElementById('map-container')?.addEventListener('webkitfullscreenchange', () => {
    const container = document.getElementById('map-container');
    if (!container) return;
    _updateFsUi(container, !!document.webkitFullscreenElement);
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

  // Emoji picker
  attachEmojiPicker('emoji-toggle', 'emoji-picker', 'chat-in');
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
      const hd = document.getElementById('hdr-dest'); if (hd) hd.textContent = updates.destination || 'Kein Ziel';
      const id = document.getElementById('info-dest'); if (id) id.textContent = updates.destination || '—';
      if (dist) { const hdi = document.getElementById('hdr-dist'); if (hdi) hdi.textContent = dist; }
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
    const t = document.getElementById('pd-type')?.value || 'sonstiger';
    const m = (document.getElementById('add-maps-link')?.value || '').trim();
    const ti = t === 'treffpunkt' ? (document.getElementById('add-time')?.value || '') : '';
    if (!d) { toast('Bitte Datum wählen.', 'error'); return; }
    try {
      await addPlanDate(d, l, t, m, ti);
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

  /* ── Planning month-view nav ── */
  document.getElementById('plan-cal-prev')?.addEventListener('click', () => {
    if (!state.planCalMonth) state.planCalMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    state.planCalMonth = new Date(state.planCalMonth.getFullYear(), state.planCalMonth.getMonth() - 1, 1);
    const sidebar = document.querySelector('.plan-polls-sidebar');
    if (sidebar) { sidebar.innerHTML = renderPlanYearCal(); attachPlanningContentEvents(); }
  });
  document.getElementById('plan-cal-next')?.addEventListener('click', () => {
    if (!state.planCalMonth) state.planCalMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    state.planCalMonth = new Date(state.planCalMonth.getFullYear(), state.planCalMonth.getMonth() + 1, 1);
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
    const container = document.getElementById('plan-map-container');
    if (!container) return;
    const isFs = container.classList.contains('map-fullscreen-active');
    if (!isFs) {
      if (document.fullscreenEnabled && container.requestFullscreen) {
        // After promise resolves, verify fullscreen actually activated.
        // On iOS 16.4+, requestFullscreen() may resolve but silently do nothing.
        container.requestFullscreen()
          .then(() => {
            // Two rAFs = ~33ms — enough to check if fullscreenElement was set
            requestAnimationFrame(() => requestAnimationFrame(() => {
              if (!document.fullscreenElement) _cssFullscreen(container, true);
            }));
          })
          .catch(() => _cssFullscreen(container, true));
      } else {
        _cssFullscreen(container, true);
      }
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen?.();
      } else {
        _cssFullscreen(container, false);
      }
    }
  });
  document.getElementById('plan-map-container')?.addEventListener('fullscreenchange', () => {
    const container = document.getElementById('plan-map-container');
    if (!container) return;
    _updateFsUi(container, !!document.fullscreenElement);
  });
  document.getElementById('plan-map-container')?.addEventListener('webkitfullscreenchange', () => {
    const container = document.getElementById('plan-map-container');
    if (!container) return;
    _updateFsUi(container, !!document.webkitFullscreenElement);
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

  // Emoji picker
  attachEmojiPicker('plan-emoji-toggle', 'plan-emoji-picker', 'plan-chat-input');
}


/* ── Plan map helpers ─────────────────────────────────────── */

let _planMapInstance = null;
let _planMapLayers   = [];

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

/* ----------------------------------------------------------
   Media tab events
   ---------------------------------------------------------- */

function attachMediaEvents() {
  /* File upload */
  document.getElementById('media-file-input')?.addEventListener('change', async e => {
    const files = [...e.target.files];
    if (!files.length) return;

    for (const file of files) {
      // Validate type
      if (!ALLOWED_MEDIA_TYPES.includes(file.type)) {
        toast(`Dateityp nicht erlaubt: ${file.type}`, 'error');
        continue;
      }
      // Validate size
      if (file.size > MAX_FILE_SIZE) {
        toast(`Datei zu groß: ${(file.size / 1024 / 1024).toFixed(1)} MB (max ${MAX_FILE_SIZE / 1024 / 1024} MB)`, 'error');
        continue;
      }

      const prog = document.getElementById('media-upload-progress');
      const bar  = document.getElementById('media-upload-bar');
      const txt  = document.getElementById('media-upload-text');
      if (prog) prog.style.display = 'block';

      try {
        const result = await uploadToCloudinary(file, pct => {
          if (bar) bar.style.width = pct + '%';
          if (txt) txt.textContent = `Wird hochgeladen… ${pct}%`;
        });

        const isVideo = file.type.startsWith('video');
        await saveTourMedia({
          tour_id:       state.currentTourId,
          user_id:       state.currentUser.id,
          username:      state.currentUser.username,
          media_type:    isVideo ? 'video' : 'image',
          url:           result.secure_url,
          thumbnail_url: result.eager?.[0]?.secure_url || '',
          public_id:     result.public_id,
          caption:       '',
          file_size:     result.bytes || 0,
        });

        toast('✓ Hochgeladen');
      } catch (err) {
        toast(err.message, 'error');
      }

      if (prog) prog.style.display = 'none';
      if (bar) bar.style.width = '0%';
    }

    // Reset input so same file can be re-uploaded
    e.target.value = '';

    // Re-render media tab
    _refreshMediaTab();
  });

  /* YouTube link toggle */
  document.getElementById('media-yt-btn')?.addEventListener('click', () => {
    const form = document.getElementById('media-yt-form');
    if (form) {
      const open = form.style.display === 'none' || !form.style.display;
      form.style.display = open ? 'flex' : 'none';
      if (open) document.getElementById('media-yt-url')?.focus();
    }
  });

  /* YouTube link add */
  document.getElementById('media-yt-add')?.addEventListener('click', async () => {
    const url     = (document.getElementById('media-yt-url')?.value || '').trim();
    const caption = (document.getElementById('media-yt-caption')?.value || '').trim();
    const ytId    = parseYouTubeUrl(url);

    if (!ytId) {
      toast('Ungültige YouTube-URL', 'error');
      return;
    }

    try {
      await saveTourMedia({
        tour_id:       state.currentTourId,
        user_id:       state.currentUser.id,
        username:      state.currentUser.username,
        media_type:    'youtube',
        url:           url,
        thumbnail_url: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
        public_id:     '',
        caption,
        file_size:     0,
      });
      toast('✓ YouTube-Video hinzugefügt');
      _refreshMediaTab();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  /* Pin/unpin media */
  document.querySelectorAll('[data-pin-media]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const isPinned = btn.dataset.pinned === '1';
      try {
        await togglePinMedia(btn.dataset.pinMedia, !isPinned);
        toast(isPinned ? 'Losgelöst' : '📌 Angepinnt');
        _refreshMediaTab();
      } catch (err) { toast(err.message, 'error'); }
    });
  });

  /* Drag & drop reorder (admin only) */
  if (isCurrentUserAdmin()) {
    let dragSrcId = null;
    document.querySelectorAll('.media-card[draggable="true"]').forEach(card => {
      card.addEventListener('dragstart', e => {
        dragSrcId = card.dataset.mediaId;
        card.style.opacity = '0.4';
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => {
        card.style.opacity = '1';
        document.querySelectorAll('.media-card').forEach(c => c.classList.remove('media-drag-over'));
      });
      card.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        card.classList.add('media-drag-over');
      });
      card.addEventListener('dragleave', () => {
        card.classList.remove('media-drag-over');
      });
      card.addEventListener('drop', async e => {
        e.preventDefault();
        card.classList.remove('media-drag-over');
        const targetId = card.dataset.mediaId;
        if (!dragSrcId || dragSrcId === targetId) return;

        // Reorder in local array
        const gallery = document.querySelector('.media-gallery');
        if (!gallery) return;
        const cards = [...gallery.querySelectorAll('.media-card')];
        const orderedIds = cards.map(c => c.dataset.mediaId);
        const fromIdx = orderedIds.indexOf(dragSrcId);
        const toIdx   = orderedIds.indexOf(targetId);
        if (fromIdx < 0 || toIdx < 0) return;

        orderedIds.splice(fromIdx, 1);
        orderedIds.splice(toIdx, 0, dragSrcId);

        try {
          await reorderTourMedia(orderedIds);
          _refreshMediaTab();
        } catch (err) { toast(err.message, 'error'); }
      });
    });
  }

  /* Delete media */
  document.querySelectorAll('[data-delete-media]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Medium wirklich löschen?')) return;
      try {
        await deleteTourMedia(btn.dataset.deleteMedia);
        toast('Gelöscht');
        _refreshMediaTab();
      } catch (err) { toast(err.message, 'error'); }
    });
  });

  /* Lightbox open */
  document.querySelectorAll('[data-lightbox-url]').forEach(el => {
    el.addEventListener('click', () => {
      const url     = el.dataset.lightboxUrl;
      const type    = el.dataset.lightboxType;
      const ytId    = el.dataset.ytId || '';
      const mediaId = el.closest('.media-card')?.dataset.mediaId || '';
      _openLightbox(url, type, ytId, mediaId);
    });
  });
}

function _openLightbox(url, type, ytId, mediaId) {
  document.getElementById('media-lightbox')?.remove();
  document.body.insertAdjacentHTML('beforeend', renderMediaLightbox(url, type, ytId, mediaId));

  const overlay = document.getElementById('media-lightbox');

  // Close
  document.getElementById('lightbox-close')?.addEventListener('click', () => overlay?.remove());
  overlay?.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  // Prev / Next
  document.getElementById('lightbox-prev')?.addEventListener('click', e => { e.stopPropagation(); _lightboxNav(-1); });
  document.getElementById('lightbox-next')?.addEventListener('click', e => { e.stopPropagation(); _lightboxNav(1); });

  // Keyboard
  const keyHandler = e => {
    if (e.key === 'ArrowLeft')  { e.preventDefault(); _lightboxNav(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); _lightboxNav(1); }
    if (e.key === 'Escape')     { overlay?.remove(); document.removeEventListener('keydown', keyHandler); }
  };
  document.addEventListener('keydown', keyHandler);
}

function _lightboxNav(dir) {
  const overlay = document.getElementById('media-lightbox');
  if (!overlay) return;
  const currentId = overlay.dataset.currentId;

  // Get sorted media list (same sort as gallery)
  const media = [...state.tourMedia].sort((a, b) =>
    (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) ||
    (a.sort_order || 0) - (b.sort_order || 0) ||
    new Date(b.created_at) - new Date(a.created_at)
  );

  const idx = media.findIndex(m => m.id === currentId);
  if (idx < 0) return;
  const nextIdx = (idx + dir + media.length) % media.length;
  const m = media[nextIdx];

  const type = m.media_type;
  const ytId = type === 'youtube' ? parseYouTubeUrl(m.url) : '';

  // Re-render content
  overlay.dataset.currentId = m.id;
  const contentEl = document.getElementById('lightbox-content');
  if (!contentEl) return;

  if (type === 'image') {
    contentEl.innerHTML = `<img src="${m.url}" style="max-width:85vw;max-height:85vh;border-radius:8px" />`;
  } else if (type === 'video') {
    contentEl.innerHTML = `<video src="${m.url}" controls autoplay style="max-width:85vw;max-height:85vh;border-radius:8px"></video>`;
  } else if (type === 'youtube') {
    contentEl.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&rel=0&modestbranding=1"
      style="width:min(85vw,960px);height:min(50vw,540px);border:none;border-radius:8px"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
  }
}

function _refreshMediaTab() {
  const tc = document.getElementById('tab-content');
  if (tc && state.currentTab === 'media') {
    tc.innerHTML = renderMediaTab();
    attachMediaEvents();
  }
}

/* ----------------------------------------------------------
   Community Media page events
   ---------------------------------------------------------- */

function attachCommunityMediaEvents() {
  const isAdmin = state.currentCommunity &&
    (state.currentCommunity.admin_id === state.currentUser.id ||
     (state.currentCommunity.co_admin_ids || []).includes(state.currentUser.id));

  /* Tour list click — load tour media preview */
  document.querySelectorAll('[data-cm-tour]').forEach(el => {
    el.addEventListener('click', async () => {
      const tourId = el.dataset.cmTour;
      state.selectedTourMedia = tourId;

      // Highlight selected tour and clear its new-badge
      document.querySelectorAll('.cm-tour-item').forEach(i => i.classList.remove('cm-tour-selected'));
      el.classList.add('cm-tour-selected');
      const badge = el.querySelector('.tab-badge');
      if (badge) badge.remove();
      // Clear from state so it doesn't reappear on re-render
      if (state.tourMediaNew) delete state.tourMediaNew[tourId];

      // Load and show tour media
      const main = document.getElementById('cm-main-content');
      if (!main) return;
      main.innerHTML = '<div style="padding:40px;text-align:center"><div class="spinner"></div></div>';
      const media = await loadTourMediaForCommunity(tourId);
      const tour = state.tours.find(t => t.id === tourId);
      main.innerHTML = `
        <div class="cm-section-header">
          <span>${esc(tour?.name || 'Tour')}</span>
          <button class="btn btn-ghost btn-sm" id="cm-back-library">← Zurück zur Bibliothek</button>
        </div>
        ${renderTourMediaPreview(media)}`;

      // Back to library button
      document.getElementById('cm-back-library')?.addEventListener('click', () => {
        state.selectedTourMedia = null;
        document.querySelectorAll('.cm-tour-item').forEach(i => i.classList.remove('cm-tour-selected'));
        _refreshCommunityMediaMain();
      });

      // Lightbox for tour media preview
      _attachCmLightbox(media);
    });
  });

  /* YouTube link toggle */
  document.getElementById('cm-yt-btn')?.addEventListener('click', () => {
    const form = document.getElementById('cm-yt-form');
    if (form) {
      const open = form.style.display === 'none' || !form.style.display;
      form.style.display = open ? 'flex' : 'none';
      if (open) document.getElementById('cm-yt-url')?.focus();
    }
  });

  /* YouTube link add */
  document.getElementById('cm-yt-add')?.addEventListener('click', async () => {
    const url     = (document.getElementById('cm-yt-url')?.value || '').trim();
    const caption = (document.getElementById('cm-yt-caption')?.value || '').trim();
    const ytId    = parseYouTubeUrl(url);
    if (!ytId) { toast('Ungültige YouTube-URL', 'error'); return; }

    try {
      await saveCommunityMedia({
        community_id:  state.currentCommunityId,
        user_id:       state.currentUser.id,
        username:      state.currentUser.username,
        media_type:    'youtube',
        url,
        thumbnail_url: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
        caption,
      });
      toast('✓ YouTube-Video hinzugefügt');
      _refreshCommunityMediaMain();
    } catch (err) { toast(err.message, 'error'); }
  });

  /* Delete community media */
  document.querySelectorAll('[data-cm-delete]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Medium löschen?')) return;
      try {
        await deleteCommunityMedia(btn.dataset.cmDelete);
        toast('Gelöscht');
        _refreshCommunityMediaMain();
      } catch (err) { toast(err.message, 'error'); }
    });
  });

  /* Pin community media */
  document.querySelectorAll('[data-cm-pin]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const isPinned = btn.dataset.pinned === '1';
      try {
        await togglePinCommunityMedia(btn.dataset.cmPin, !isPinned);
        toast(isPinned ? 'Losgelöst' : '📌 Angepinnt');
        _refreshCommunityMediaMain();
      } catch (err) { toast(err.message, 'error'); }
    });
  });

  /* Drag & drop reorder */
  if (isAdmin) {
    let dragSrcId = null;
    document.querySelectorAll('#cm-main-content .media-card[draggable="true"]').forEach(card => {
      card.addEventListener('dragstart', e => {
        dragSrcId = card.dataset.mediaId;
        card.style.opacity = '0.4';
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => {
        card.style.opacity = '1';
        document.querySelectorAll('.media-card').forEach(c => c.classList.remove('media-drag-over'));
      });
      card.addEventListener('dragover', e => { e.preventDefault(); card.classList.add('media-drag-over'); });
      card.addEventListener('dragleave', () => card.classList.remove('media-drag-over'));
      card.addEventListener('drop', async e => {
        e.preventDefault();
        card.classList.remove('media-drag-over');
        const targetId = card.dataset.mediaId;
        if (!dragSrcId || dragSrcId === targetId) return;
        const gallery = document.querySelector('#cm-main-content .media-gallery');
        if (!gallery) return;
        const ids = [...gallery.querySelectorAll('.media-card')].map(c => c.dataset.mediaId);
        const from = ids.indexOf(dragSrcId);
        const to   = ids.indexOf(targetId);
        if (from < 0 || to < 0) return;
        ids.splice(from, 1);
        ids.splice(to, 0, dragSrcId);
        try { await reorderCommunityMedia(ids); _refreshCommunityMediaMain(); }
        catch (err) { toast(err.message, 'error'); }
      });
    });
  }

  /* Lightbox for community library */
  _attachCmLightbox(state.communityMedia);
}

function _attachCmLightbox(mediaList) {
  // Store media list for navigation
  window._cmLightboxMedia = mediaList;

  document.querySelectorAll('[data-cm-lightbox-url]').forEach(el => {
    el.addEventListener('click', () => {
      const url  = el.dataset.cmLightboxUrl;
      const type = el.dataset.cmLightboxType;
      const ytId = el.dataset.cmYtId || '';
      const mediaId = el.closest('.media-card')?.dataset.mediaId || '';
      document.getElementById('media-lightbox')?.remove();
      document.body.insertAdjacentHTML('beforeend', renderMediaLightbox(url, type, ytId, mediaId));

      const overlay = document.getElementById('media-lightbox');
      document.getElementById('lightbox-close')?.addEventListener('click', () => overlay?.remove());
      overlay?.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

      // Prev/next navigation
      document.getElementById('lightbox-prev')?.addEventListener('click', e => { e.stopPropagation(); _cmLightboxNav(-1); });
      document.getElementById('lightbox-next')?.addEventListener('click', e => { e.stopPropagation(); _cmLightboxNav(1); });
      const keyHandler = e => {
        if (e.key === 'ArrowLeft')  { e.preventDefault(); _cmLightboxNav(-1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); _cmLightboxNav(1); }
        if (e.key === 'Escape')     { overlay?.remove(); document.removeEventListener('keydown', keyHandler); }
      };
      document.addEventListener('keydown', keyHandler);
    });
  });
}

function _cmLightboxNav(dir) {
  const overlay = document.getElementById('media-lightbox');
  if (!overlay) return;
  const currentId = overlay.dataset.currentId;
  const list = window._cmLightboxMedia || [];
  if (!list.length) return;

  const idx = list.findIndex(m => m.id === currentId);
  if (idx < 0) return;
  const nextIdx = (idx + dir + list.length) % list.length;
  const m = list[nextIdx];

  const type = m.media_type;
  const ytId = type === 'youtube' ? parseYouTubeUrl(m.url) : '';
  overlay.dataset.currentId = m.id;

  const contentEl = document.getElementById('lightbox-content');
  if (!contentEl) return;

  if (type === 'image') {
    contentEl.innerHTML = `<img src="${m.url}" style="max-width:85vw;max-height:85vh;border-radius:8px" />`;
  } else if (type === 'video') {
    contentEl.innerHTML = `<video src="${m.url}" controls autoplay style="max-width:85vw;max-height:85vh;border-radius:8px"></video>`;
  } else if (type === 'youtube') {
    contentEl.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&rel=0&modestbranding=1"
      style="width:min(85vw,960px);height:min(50vw,540px);border:none;border-radius:8px"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
  }
}

function _refreshCommunityMediaMain() {
  const main = document.getElementById('cm-main-content');
  if (!main) return;

  const isAdmin = state.currentCommunity &&
    (state.currentCommunity.admin_id === state.currentUser.id ||
     (state.currentCommunity.co_admin_ids || []).includes(state.currentUser.id));

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
    ? '<div style="text-align:center;padding:40px;color:var(--muted)"><div style="font-size:36px;margin-bottom:8px">📸</div><div>Noch keine Community-Medien.</div></div>'
    : `<div class="media-gallery">${cmMedia.map(m => _renderCommunityMediaCard(m, isAdmin)).join('')}</div>`;

  main.innerHTML = `<div class="cm-section-header">Community Bibliothek</div>${ytUpload}${cmGallery}`;
  attachCommunityMediaEvents();
}

/* ============================================================
   Site Info / Changelog Modal helpers
   ============================================================ */

// Cache for current modal session
let _siteContent = null;     // { info: {key,content,...}, changelog: {...} }
let _siteCurrentTab = 'info';
let _siteEditing = false;

async function openSiteInfoModal() {
  const overlay = document.getElementById('site-info-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  // Reset to view mode + changelog tab (most likely what user is looking for)
  _siteEditing = false;
  _siteCurrentTab = 'changelog';
  _setSiteInfoTabUI('changelog');
  _setSiteInfoModeUI('view');

  // Load (with placeholder while loading)
  for (const k of ['info', 'changelog']) {
    const el = document.getElementById(`site-info-view-${k}`);
    if (el) el.innerHTML = '<div style="color:var(--muted);padding:20px">Lädt…</div>';
  }
  try {
    _siteContent = await loadSiteContent();
  } catch (e) {
    toast('Inhalte konnten nicht geladen werden', 'error');
    _siteContent = {};
  }
  _renderSiteInfoView('info');
  _renderSiteInfoView('changelog');
}

function closeSiteInfoModal() {
  const overlay = document.getElementById('site-info-overlay');
  if (!overlay) return;
  // Confirm if unsaved edits
  if (_siteEditing) {
    const ta = document.getElementById('site-info-textarea');
    const original = _siteContent?.[_siteCurrentTab]?.content || '';
    if (ta && ta.value !== original) {
      if (!confirm('Ungespeicherte Änderungen verwerfen?')) return;
    }
  }
  overlay.style.display = 'none';
  document.body.style.overflow = '';
  _siteEditing = false;
}

function switchSiteInfoTab(tab) {
  if (tab !== 'info' && tab !== 'changelog') return;
  // If editing, confirm before switching
  if (_siteEditing) {
    const ta = document.getElementById('site-info-textarea');
    const original = _siteContent?.[_siteCurrentTab]?.content || '';
    if (ta && ta.value !== original) {
      if (!confirm('Ungespeicherte Änderungen verwerfen?')) return;
    }
    exitSiteInfoEditMode(true);
  }
  _siteCurrentTab = tab;
  _setSiteInfoTabUI(tab);
}

function enterSiteInfoEditMode() {
  if (!state.isSiteAdminUser) return;
  _siteEditing = true;
  const ta = document.getElementById('site-info-textarea');
  if (ta) ta.value = _siteContent?.[_siteCurrentTab]?.content || '';
  _setSiteInfoModeUI('edit');
  updateSiteInfoPreview();   // initial render of preview pane
}

function exitSiteInfoEditMode(silent) {
  _siteEditing = false;
  _setSiteInfoModeUI('view');
  if (!silent) {
    // re-render to be safe
    _renderSiteInfoView(_siteCurrentTab);
  }
}

async function saveSiteInfoEdit() {
  if (!state.isSiteAdminUser) return;
  const ta = document.getElementById('site-info-textarea');
  if (!ta) return;
  const newContent = ta.value;
  const btn = document.getElementById('site-info-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Speichert…'; }
  try {
    await saveSiteContent(_siteCurrentTab, newContent);
    if (!_siteContent) _siteContent = {};
    _siteContent[_siteCurrentTab] = {
      ..._siteContent[_siteCurrentTab],
      key: _siteCurrentTab,
      content: newContent,
      updated_at: new Date().toISOString(),
    };
    _renderSiteInfoView(_siteCurrentTab);
    _siteEditing = false;
    _setSiteInfoModeUI('view');
    toast('✓ Gespeichert');
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Speichern'; }
  }
}

/* ---------- internal UI helpers ---------- */

function _setSiteInfoTabUI(tab) {
  document.querySelectorAll('.site-info-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.siTab === tab);
  });
  for (const k of ['info', 'changelog']) {
    const v = document.getElementById(`site-info-view-${k}`);
    if (v) v.style.display = (k === tab && !_siteEditing) ? 'block' : 'none';
  }
}

function _setSiteInfoModeUI(mode) {
  const editArea = document.getElementById('site-info-edit-area');
  const editBtn  = document.getElementById('site-info-edit');
  const view = document.getElementById(`site-info-view-${_siteCurrentTab}`);
  if (mode === 'edit') {
    if (editArea) editArea.style.display = 'flex';
    if (view)     view.style.display = 'none';
    if (editBtn)  editBtn.style.display = 'none';
  } else {
    if (editArea) editArea.style.display = 'none';
    if (view)     view.style.display = 'block';
    if (editBtn)  editBtn.style.display = '';
  }
}

function _renderSiteInfoView(key) {
  const el = document.getElementById(`site-info-view-${key}`);
  if (!el) return;
  const md = _siteContent?.[key]?.content || '_(noch kein Inhalt)_';
  // Render markdown via marked.js if available, fallback to plain text
  if (typeof marked !== 'undefined') {
    try {
      el.innerHTML = marked.parse(md, { breaks: true, gfm: true });
    } catch {
      el.textContent = md;
    }
  } else {
    el.textContent = md;
  }
}

function updateSiteInfoPreview() {
  const ta = document.getElementById('site-info-textarea');
  const el = document.getElementById('site-info-preview');
  if (!ta || !el) return;
  const md = ta.value || '_(leer)_';
  if (typeof marked !== 'undefined') {
    try { el.innerHTML = marked.parse(md, { breaks: true, gfm: true }); return; }
    catch { /* fall through */ }
  }
  el.textContent = md;
}

/* ============================================================
   Profile Modal + Community Settings Modal — helpers
   ============================================================ */

async function openProfileModal() {
  const overlay = document.getElementById('profile-modal');
  const body    = document.getElementById('profile-modal-body');
  if (!overlay || !body) return;
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  body.innerHTML = '<div style="color:var(--muted);padding:20px">Lädt…</div>';
  try {
    body.innerHTML = await renderProfileBody();
    attachProfileModalEvents();
  } catch (e) {
    body.innerHTML = `<div style="color:var(--danger);padding:20px">Fehler: ${e.message}</div>`;
  }
}

function closeProfileModal() {
  const overlay = document.getElementById('profile-modal');
  if (overlay) overlay.style.display = 'none';
  document.body.style.overflow = '';
}

async function openCommunitySettingsModal() {
  const overlay = document.getElementById('community-settings-modal');
  const body    = document.getElementById('community-settings-modal-body');
  if (!overlay || !body) return;
  if (!state.currentCommunity) { toast('Keine Community geladen', 'error'); return; }
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  body.innerHTML = renderCommunitySettingsBody();
  attachCommunitySettingsModalEvents();
}

function closeCommunitySettingsModal() {
  const overlay = document.getElementById('community-settings-modal');
  if (overlay) overlay.style.display = 'none';
  document.body.style.overflow = '';
}

async function reloadCommunitySettingsModal() {
  // Re-fetch members then re-render modal body in place
  try { await loadCommunityData(state.currentCommunityId); } catch(e) { /* ignore */ }
  const body = document.getElementById('community-settings-modal-body');
  if (body) {
    body.innerHTML = renderCommunitySettingsBody();
    attachCommunitySettingsModalEvents();
  }
}

/* ----------------------------------------------------------
   Scoped event binders — called only when the modal body is
   (re-)rendered, so no stacking on the global attachEvents().
   ---------------------------------------------------------- */

function attachProfileModalEvents() {
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

  /* --- PWA Push Button --- */
  const pushBtn = document.getElementById('pwa-push-btn');
  if (!pushBtn) return;

  // Initial state: query browser + subscription
  refreshPushButtonState();

  // Click: dispatch based on CURRENT state queried fresh (not stale _mode attr).
  // IMPORTANT for Safari: Notification.requestPermission() must be called
  // synchronously in the user-gesture event. Any `await` before it kills the
  // user-activation and Safari silently no-ops the prompt.
  pushBtn.addEventListener('click', async () => {
    const btn = document.getElementById('pwa-push-btn');
    if (!btn || btn.disabled) return;

    // Safari-safe fast path: if permission is 'default' AND push is supported,
    // call requestPermission() FIRST, synchronously, before any await.
    const supported   = isPushSupported();
    const permission  = (typeof Notification !== 'undefined') ? Notification.permission : 'denied';

    if (supported && permission === 'default') {
      // Fire the prompt immediately — any prior await would invalidate the gesture.
      Notification.requestPermission().then(async (perm) => {
        if (perm !== 'granted') {
          toast('Benachrichtigungen wurden abgelehnt.', 'error');
          await refreshPushButtonState();
          return;
        }
        // Now we can subscribe (permission granted, no gesture needed)
        try {
          const reg = await navigator.serviceWorker.ready;
          const vapidKey = typeof VAPID_PUBLIC_KEY !== 'undefined' ? VAPID_PUBLIC_KEY : null;
          const opts = { userVisibleOnly: true };
          if (vapidKey) opts.applicationServerKey = urlBase64ToUint8Array(vapidKey);
          const sub = await reg.pushManager.subscribe(opts);
          await savePushSubscription(sub);
          toast('🔔 Benachrichtigungen aktiviert!');
        } catch (err) {
          console.error('[Push] subscribe error:', err);
          toast('Fehler beim Aktivieren der Benachrichtigungen.', 'error');
        }
        await refreshPushButtonState();
      });
      return;
    }

    // Permission already granted → check if actually subscribed
    btn.disabled = true;
    btn.textContent = '…';
    try {
      const status = await getPushSubscriptionStatus();
      if (status === 'subscribed') {
        // Deactivate
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          await sb.from('push_subscriptions')
            .delete()
            .eq('user_id', state.currentUser.id)
            .eq('endpoint', sub.endpoint);
        }
        toast('🔕 Push-Benachrichtigungen deaktiviert');
      } else if (permission === 'granted') {
        // Granted but no subscription (e.g. after unsubscribe) → re-subscribe.
        // Safe to await here because permission is already granted.
        const reg = await navigator.serviceWorker.ready;
        const vapidKey = typeof VAPID_PUBLIC_KEY !== 'undefined' ? VAPID_PUBLIC_KEY : null;
        const opts = { userVisibleOnly: true };
        if (vapidKey) opts.applicationServerKey = urlBase64ToUint8Array(vapidKey);
        const sub = await reg.pushManager.subscribe(opts);
        await savePushSubscription(sub);
        toast('🔔 Benachrichtigungen aktiviert!');
      } else if (permission === 'denied') {
        toast('Bitte erlaube Benachrichtigungen in den Browser-Einstellungen.', 'error');
      }
    } catch (err) {
      console.error('[Push] action error:', err);
      toast('Fehler: ' + (err.message || 'unbekannt'), 'error');
    }
    await refreshPushButtonState();
  });
}

/* Query current push state and update button + hint UI. Always queries fresh,
   so this works as both initial-state setter and post-action refresher. */
async function refreshPushButtonState() {
  const pushBtn  = document.getElementById('pwa-push-btn');
  const pushHint = document.getElementById('pwa-push-hint');
  if (!pushBtn) return;

  pushBtn.disabled = false;
  const setHint = (txt) => { if (pushHint) { pushHint.textContent = txt || ''; pushHint.style.display = txt ? '' : 'none'; } };

  let status;
  try { status = await getPushSubscriptionStatus(); }
  catch { status = 'unsupported'; }

  const isIOS      = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone = window.navigator.standalone;

  if (status === 'unsupported') {
    if (isIOS && !standalone) {
      pushBtn.textContent = '📲 App zuerst installieren';
      pushBtn.disabled = true;
      setHint('Tippe auf Teilen → „Zum Home-Bildschirm", dann öffne die installierte App.');
    } else {
      pushBtn.textContent = '❌ Push nicht verfügbar';
      pushBtn.disabled = true;
      setHint('Dein Browser unterstützt keine Push-Benachrichtigungen.');
    }
    return;
  }
  if (status === 'denied') {
    pushBtn.textContent = '🚫 Berechtigung verweigert';
    pushBtn.disabled = true;
    setHint('Bitte erlaube Benachrichtigungen in den Browser-Einstellungen.');
    return;
  }
  if (status === 'subscribed') {
    pushBtn.textContent = '🔕 Push deaktivieren';
    setHint('');
    return;
  }
  // 'default' or no subscription
  pushBtn.textContent = '🔔 Push-Benachrichtigungen aktivieren';
  setHint('');
}

function attachCommunitySettingsModalEvents() {
  /* --- Save --- */
  document.getElementById('cs-save')?.addEventListener('click', async () => {
    const name     = (document.getElementById('cs-name')?.value     || '').trim();
    const password = (document.getElementById('cs-password')?.value || '').trim();
    if (!name)     { toast('Name darf nicht leer sein.', 'error'); return; }
    if (!password || password.length < 3) { toast('Passwort mind. 3 Zeichen.', 'error'); return; }
    setBtn('cs-save', true);
    try {
      await updateCommunity({ name, password });
      toast('✓ Einstellungen gespeichert');
      // Refresh the community-home title underneath the modal
      const titleEl = document.querySelector('.tour-detail-title');
      if (titleEl) titleEl.textContent = name;
    } catch (e) { toast(e.message, 'error'); }
    setBtn('cs-save', false, 'Speichern');
  });

  /* --- Promote --- */
  document.querySelectorAll('[data-promote-community]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await promoteCommunityAdmin(btn.dataset.promoteCommunity);
        toast('✓ Co-Admin gesetzt');
        await reloadCommunitySettingsModal();
      } catch (e) { toast(e.message, 'error'); }
    });
  });

  /* --- Demote --- */
  document.querySelectorAll('[data-demote-community]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await demoteCommunityAdmin(btn.dataset.demoteCommunity);
        toast('Co-Admin entfernt');
        await reloadCommunitySettingsModal();
      } catch (e) { toast(e.message, 'error'); }
    });
  });

  /* --- Kick --- */
  document.querySelectorAll('[data-kick-community]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const username = state.profileCache[btn.dataset.kickCommunity] || btn.dataset.kickCommunity;
      if (!confirm(`„${username}" aus der Community entfernen?`)) return;
      try {
        await removeCommunityMember(btn.dataset.kickCommunity);
        toast(`${username} entfernt`);
        await reloadCommunitySettingsModal();
      } catch (e) { toast(e.message, 'error'); }
    });
  });
}
