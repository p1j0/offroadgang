/* ============================================================
   pwa.js – Service Worker Registrierung & Push Notifications
   ============================================================ */

/* ----------------------------------------------------------
   Service Worker registrieren
   ---------------------------------------------------------- */
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    console.log('[PWA] Service Worker registriert:', reg.scope);

    // Guard so we only auto-reload once per page session
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      console.log('[PWA] Neuer SW aktiv → reload');
      window.location.reload();
    });

    // New SW installed → take over silently
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // sw.js already calls skipWaiting() in its install handler, so this is
          // belt-and-braces. The reload happens via controllerchange above.
          console.log('[PWA] Neue Version installiert → Aktivierung anstossen');
          newWorker.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });

    // If a waiting SW already exists at page load, kick it
    if (reg.waiting && navigator.serviceWorker.controller) {
      console.log('[PWA] Wartender SW gefunden → Aktivierung anstossen');
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }

    // Periodically check for updates (PWAs in standalone mode don't always
    // re-fetch sw.js on app resume; this nudges the browser to look)
    setInterval(() => {
      reg.update().catch(() => {});
    }, 60 * 1000);

    // Also check when the app comes back to the foreground (iOS PWA)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        reg.update().catch(() => {});
      }
    });

    return reg;
  } catch (err) {
    console.warn('[PWA] Service Worker Fehler:', err);
    return null;
  }
}

/* ----------------------------------------------------------
   iOS-spezifischer Install-Banner
   Zeigt eine Anleitung, wenn die App noch nicht installiert ist
   ---------------------------------------------------------- */
function showIOSInstallBanner() {
  // Bereits installiert (standalone) oder Banner schon gezeigt?
  if (window.navigator.standalone) return;
  if (localStorage.getItem('pwa-ios-banner-dismissed')) return;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (!isIOS) return;

  const banner = document.createElement('div');
  banner.id = 'ios-install-banner';
  banner.innerHTML = `
    <div class="ios-banner-inner">
      <img src="/img/icon-72x72.png" alt="MotoRoute" class="ios-banner-icon" />
      <div class="ios-banner-text">
        <strong>MotoRoute installieren</strong>
        <span>Tippe auf <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg> dann „Zum Home-Bildschirm"</span>
      </div>
      <button class="ios-banner-close" onclick="dismissIOSBanner()">✕</button>
    </div>
  `;
  document.body.appendChild(banner);
  // Kurz verzögert einblenden
  setTimeout(() => banner.classList.add('visible'), 500);
}

function dismissIOSBanner() {
  const banner = document.getElementById('ios-install-banner');
  if (banner) {
    banner.classList.remove('visible');
    setTimeout(() => banner.remove(), 300);
  }
  localStorage.setItem('pwa-ios-banner-dismissed', '1');
}

/* ----------------------------------------------------------
   Android / Desktop: beforeinstallprompt abfangen
   ---------------------------------------------------------- */
let _deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _deferredInstallPrompt = e;
  showAndroidInstallBanner();
});

function showAndroidInstallBanner() {
  if (localStorage.getItem('pwa-android-banner-dismissed')) return;

  const banner = document.createElement('div');
  banner.id = 'android-install-banner';
  banner.innerHTML = `
    <div class="ios-banner-inner">
      <img src="/img/icon-72x72.png" alt="MotoRoute" class="ios-banner-icon" />
      <div class="ios-banner-text">
        <strong>MotoRoute installieren</strong>
        <span>Als App auf deinem Gerät speichern</span>
      </div>
      <button class="btn btn-primary" style="font-size:13px;padding:7px 14px;" onclick="triggerInstallPrompt()">Installieren</button>
      <button class="ios-banner-close" onclick="dismissAndroidBanner()">✕</button>
    </div>
  `;
  document.body.appendChild(banner);
  setTimeout(() => banner.classList.add('visible'), 500);
}

async function triggerInstallPrompt() {
  if (!_deferredInstallPrompt) return;
  _deferredInstallPrompt.prompt();
  const { outcome } = await _deferredInstallPrompt.userChoice;
  console.log('[PWA] Install-Entscheidung:', outcome);
  _deferredInstallPrompt = null;
  dismissAndroidBanner();
}

function dismissAndroidBanner() {
  const banner = document.getElementById('android-install-banner');
  if (banner) {
    banner.classList.remove('visible');
    setTimeout(() => banner.remove(), 300);
  }
  localStorage.setItem('pwa-android-banner-dismissed', '1');
}

/* ----------------------------------------------------------
   Push Notifications: Permission anfragen & Subscription speichern
   ---------------------------------------------------------- */

/**
 * Prüft ob Push grundsätzlich möglich ist.
 * iOS: nur wenn als PWA installiert (standalone).
 */
function isPushSupported() {
  if (!('PushManager' in window)) return false;
  if (!('serviceWorker' in navigator)) return false;
  // iOS: nur im Standalone-Modus
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (isIOS && !window.navigator.standalone) return false;
  return true;
}

/**
 * Fordert Push-Berechtigung an und speichert die Subscription in Supabase.
 * Wird aufgerufen wenn der User auf "Benachrichtigungen aktivieren" tippt.
 */
async function requestPushPermission() {
  if (!isPushSupported()) {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isIOS && !window.navigator.standalone) {
      toast('Bitte installiere die App zuerst (Teilen → Zum Home-Bildschirm)', 'error');
    } else {
      toast('Push-Benachrichtigungen werden in diesem Browser nicht unterstützt.', 'error');
    }
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    toast('Benachrichtigungen wurden abgelehnt.', 'error');
    return false;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    // VAPID Public Key – muss in config.js definiert sein (oder hier hardcoded)
    const vapidKey = typeof VAPID_PUBLIC_KEY !== 'undefined' ? VAPID_PUBLIC_KEY : null;

    const subscribeOptions = { userVisibleOnly: true };
    if (vapidKey) {
      subscribeOptions.applicationServerKey = urlBase64ToUint8Array(vapidKey);
    }

    const subscription = await reg.pushManager.subscribe(subscribeOptions);
    await savePushSubscription(subscription);
    toast('🔔 Benachrichtigungen aktiviert!');
    return true;
  } catch (err) {
    console.error('[PWA] Push-Subscription Fehler:', err);
    toast('Fehler beim Aktivieren der Benachrichtigungen.', 'error');
    return false;
  }
}

/**
 * Speichert die Push-Subscription in der Supabase-Tabelle push_subscriptions.
 */
async function savePushSubscription(subscription) {
  const user = state.currentUser;
  if (!user) return;

  const sub = subscription.toJSON();

  // Upsert per Endpoint — jedes Gerät bekommt einen eigenen Eintrag.
  // Gleicher Endpoint = Update, neuer Endpoint = neuer Eintrag.
  // Alte ungültige Endpoints werden automatisch via 410-Gone in send-push gelöscht.
  const { error } = await sb
    .from('push_subscriptions')
    .upsert({
      user_id:    user.id,
      endpoint:   sub.endpoint,
      p256dh:     sub.keys?.p256dh,
      auth:       sub.keys?.auth,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,endpoint' });

  if (error) console.error('[PWA] Subscription speichern fehlgeschlagen:', error);
}

/**
 * Prüft ob der User bereits eine aktive Push-Subscription hat.
 */
async function getPushSubscriptionStatus() {
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? 'subscribed' : 'unsubscribed';
  } catch {
    return 'unsupported';
  }
}

/* ----------------------------------------------------------
   Hilfsfunktion: VAPID Key konvertieren
   ---------------------------------------------------------- */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

/* ----------------------------------------------------------
   Init – wird von app.js aufgerufen
   ---------------------------------------------------------- */
async function initPWA() {
  await registerServiceWorker();

  // iOS-Banner nur einmal zeigen (nicht sofort beim ersten Load)
  setTimeout(() => {
    showIOSInstallBanner();
  }, 3000);
}
