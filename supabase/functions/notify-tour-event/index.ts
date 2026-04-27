/**
 * notify-tour-event – real-time push + email on check-in or Treffpunkt
 * Deploy: supabase functions deploy notify-tour-event --no-verify-jwt
 *
 * Body: { tour_id, event_type: 'checkin'|'treffpunkt', actor_user_id, actor_username, details? }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const VAPID_PRIV  = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_PUB   = Deno.env.get('VAPID_PUBLIC_KEY')  ?? '';
const VAPID_SUBJ  = Deno.env.get('VAPID_SUBJECT')     ?? 'mailto:admin@motoroute.app';
const RESEND_KEY  = Deno.env.get('RESEND_API_KEY')    ?? '';
const SITE_URL    = Deno.env.get('SITE_URL')           ?? 'https://motoroute.app';
const SB_URL      = Deno.env.get('SUPABASE_URL')       ?? '';
const SB_SRK      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const OFFLINE_MIN = 5; // consider user offline after 5 min

const sb = createClient(SB_URL, SB_SRK);

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { tour_id, event_type, actor_user_id, actor_username, details } = body;
  if (!tour_id || !event_type || !actor_user_id) {
    return new Response(JSON.stringify({ error: 'tour_id, event_type, actor_user_id required' }), { status: 400 });
  }

  try {
    const result = await notify({ tour_id, event_type, actor_user_id, actor_username: actor_username ?? 'Unbekannt', details });
    return new Response(JSON.stringify({ ok: true, ...result }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[notify-tour-event]', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS });
  }
});

async function notify({ tour_id, event_type, actor_user_id, actor_username, details }: {
  tour_id: string; event_type: string; actor_user_id: string; actor_username: string; details?: string;
}) {
  // 1. Fetch tour name
  const { data: tour } = await sb.from('tours').select('name, admin_id, co_admin_ids').eq('id', tour_id).single();
  const tourName = tour?.name ?? 'Tour';

  // 2. Collect all member IDs for this tour
  const [adminIds, memberRes] = await Promise.all([
    Promise.resolve([
      tour?.admin_id,
      ...((tour?.co_admin_ids as string[] | null) ?? []),
    ].filter(Boolean) as string[]),
    sb.from('tour_members').select('user_id').eq('tour_id', tour_id),
  ]);
  const memberUserIds = (memberRes.data ?? []).map((m: any) => m.user_id as string);
  const allIds = [...new Set([...adminIds, ...memberUserIds])];
  const recipients = allIds.filter(id => id !== actor_user_id);

  if (!recipients.length) return { push: 0, email: 0 };

  // 3. Build message
  const { title, pushBody, emailBody } = buildMessage(event_type, actor_username, tourName, details);

  // 4. Push notifications
  const pushSent = await sendPush(recipients, title, pushBody, `/#join=${tour_id}`);

  // 5. Email to offline members who opted in
  const emailSent = await sendEmails(recipients, actor_user_id, tourName, tour_id, title, emailBody);

  return { push: pushSent, email: emailSent };
}

function buildMessage(eventType: string, username: string, tourName: string, details?: string) {
  if (eventType === 'checkin') {
    return {
      title:     '✅ Check-in bestätigt',
      pushBody:  `${username} hat sich für „${tourName}" angemeldet`,
      emailBody: `${username} hat sich für die Tour <strong>„${tourName}"</strong> angemeldet.`,
    };
  }
  // treffpunkt
  const det = details ? `: ${details}` : '';
  return {
    title:     '📍 Treffpunkt hinzugefügt',
    pushBody:  `${username} hat einen Treffpunkt für „${tourName}" hinzugefügt${det}`,
    emailBody: `${username} hat einen Treffpunkt für die Tour <strong>„${tourName}"</strong> hinzugefügt${det ? `<br>${details}` : ''}.`,
  };
}

// ── Push ─────────────────────────────────────────────────────────────────────

async function sendPush(userIds: string[], title: string, body: string, url: string): Promise<number> {
  if (!VAPID_PRIV || !VAPID_PUB) { console.warn('[push] VAPID keys missing'); return 0; }

  const { data: subs } = await sb
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, user_id')
    .in('user_id', userIds);

  if (!subs?.length) return 0;

  const payload = new TextEncoder().encode(
    JSON.stringify({ title, body, icon: '/img/icon-192x192.png', url, tag: 'motoroute-event' })
  );

  const results = await Promise.allSettled(subs.map(async (sub: any) => {
    const jwt = await vapidJWT(sub.endpoint, VAPID_PRIV, VAPID_PUB, VAPID_SUBJ);
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `vapid t=${jwt},k=${VAPID_PUB}`,
        'Content-Type':  'application/octet-stream',
        'TTL':           '86400',
      },
      body: payload,
    });
    if (res.status === 410) {
      await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    }
    return res.status;
  }));

  return results.filter(r => r.status === 'fulfilled' && (r.value as number) < 300).length;
}

// ── Email ─────────────────────────────────────────────────────────────────────

async function sendEmails(
  recipients: string[], actorId: string, tourName: string, tourId: string,
  subject: string, bodyHtml: string
): Promise<number> {
  if (!RESEND_KEY) { console.warn('[email] RESEND_API_KEY missing'); return 0; }

  const offlineCut = new Date(Date.now() - OFFLINE_MIN * 60 * 1000).toISOString();

  const { data: profiles } = await sb
    .from('profiles')
    .select('id, username, notification_email, notify_changes, last_seen_at')
    .in('id', recipients)
    .neq('id', actorId)
    .eq('notify_changes', true)
    .not('notification_email', 'is', null)
    .neq('notification_email', '')
    .or(`last_seen_at.is.null,last_seen_at.lt.${offlineCut}`);

  if (!profiles?.length) return 0;

  const ctaUrl  = `${SITE_URL}/#join=${tourId}`;
  const html    = buildEmailHtml(tourName, bodyHtml, ctaUrl);
  const fullSubject = `🏍️ ${subject} – MotoRoute`;

  let sent = 0;
  await Promise.allSettled(profiles.map(async (p: any) => {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    'MotoRoute <onboarding@resend.dev>',
        to:      p.notification_email,
        subject: fullSubject,
        html,
      }),
    });
    if (res.ok) sent++;
    else console.error('[email] Resend error', res.status, await res.text());
  }));

  return sent;
}

function buildEmailHtml(tourName: string, bodyHtml: string, ctaUrl: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0d0d10;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table width="540" cellpadding="0" cellspacing="0" style="background:#16161a;border:1px solid #2a2a35;border-radius:12px;overflow:hidden;max-width:100%">
  <tr><td style="background:linear-gradient(135deg,#f07800,#b85c00);padding:22px 28px">
    <div style="font-size:24px;font-weight:900;letter-spacing:3px;color:#000">MOTO<span style="color:#fff">ROUTE</span></div>
  </td></tr>
  <tr><td style="padding:24px 28px">
    <p style="margin:0 0 16px;font-size:14px;color:#eeebe4;line-height:1.6">${bodyHtml}</p>
    <a href="${ctaUrl}" style="display:inline-block;background:#f07800;color:#000;text-decoration:none;font-weight:700;padding:10px 22px;border-radius:6px;font-size:13px">Tour öffnen →</a>
  </td></tr>
  <tr><td style="padding:14px 28px 20px;border-top:1px solid #2a2a35">
    <p style="margin:0;font-size:11px;color:#7a7880">Du erhältst diese E-Mail, weil du Mitglied dieser Tour bist.<br>Benachrichtigungen können im Profil deaktiviert werden.</p>
  </td></tr>
</table></td></tr></table></body></html>`;
}

// ── VAPID helpers (copied from send-push) ────────────────────────────────────

async function importVapidPrivateKey(pem: string): Promise<CryptoKey> {
  const cleaned = pem.replace(/\\n/g, '\n');
  const lines = cleaned.split('\n').filter(l => l.trim() && !l.includes('-----'));
  const der = Uint8Array.from(atob(lines.join('')), c => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der.buffer, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

function b64u(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function vapidJWT(endpoint: string, privPem: string, pubKey: string, subject: string): Promise<string> {
  const aud = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  const h = b64u(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const p = b64u(new TextEncoder().encode(JSON.stringify({ aud, exp: now + 3600, sub: subject })));
  const key = await importVapidPrivateKey(privPem);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(sig)}`;
}
