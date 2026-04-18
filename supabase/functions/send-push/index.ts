/**
 * send-push – Supabase Edge Function
 *
 * Sendet Web Push Notifications an einen oder mehrere User.
 *
 * Aufruf von der App (via Supabase RPC oder direkt per fetch):
 *   POST /functions/v1/send-push
 *   Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
 *   Body: {
 *     user_ids: string[],      // Array von user UUIDs
 *     title:    string,
 *     body:     string,
 *     url?:     string,        // Ziel-URL beim Klick (default: "/")
 *     tag?:     string         // Gruppiert Benachrichtigungen (default: "motoroute")
 *   }
 *
 * Benötigte Supabase Secrets (Settings → Edge Functions → Secrets):
 *   VAPID_PRIVATE_KEY   (PEM, einzeilig – Newlines als \n)
 *   VAPID_PUBLIC_KEY    (base64url)
 *   VAPID_SUBJECT       (mailto:deine@email.de)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ---------- VAPID Signing (Web Crypto API) ----------

async function importVapidPrivateKey(pemBase64: string): Promise<CryptoKey> {
  // PEM → DER
  const pem = pemBase64.replace(/\\n/g, '\n');
  const lines = pem.split('\n').filter(l => l && !l.startsWith('---'));
  const der = Uint8Array.from(atob(lines.join('')), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    der.buffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
}

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function buildVapidJWT(endpoint: string, privateKeyPem: string, publicKeyB64: string, subject: string): Promise<string> {
  const audience = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  const header  = base64url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = base64url(new TextEncoder().encode(JSON.stringify({ aud: audience, exp: now + 3600, sub: subject })));
  const sigInput = new TextEncoder().encode(`${header}.${payload}`);
  const key = await importVapidPrivateKey(privateKeyPem);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, sigInput);
  return `${header}.${payload}.${base64url(sig)}`;
}

// ---------- Edge Function Handler ----------

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' } });
  }

  const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
  const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY')  ?? '';
  const VAPID_SUBJECT     = Deno.env.get('VAPID_SUBJECT')     ?? 'mailto:admin@motoroute.app';
  const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')      ?? '';
  const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  // Auth prüfen (Service Role Key oder eigener Secret)
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ') || authHeader.slice(7) !== SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { user_ids, title, body, url = '/', tag = 'motoroute' } = await req.json();
  if (!user_ids?.length || !title || !body) {
    return new Response(JSON.stringify({ error: 'user_ids, title, body required' }), { status: 400 });
  }

  // Subscriptions aus DB holen
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, user_id')
    .in('user_id', user_ids);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  if (!subs?.length) return new Response(JSON.stringify({ sent: 0, message: 'No subscriptions found' }), { status: 200 });

  const payload = JSON.stringify({ title, body, icon: '/img/icon-192x192.png', url, tag });

  const results = await Promise.allSettled(
    subs.map(async (sub) => {
      const jwt = await buildVapidJWT(sub.endpoint, VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT);
      const vapidAuth = `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`;

      const res = await fetch(sub.endpoint, {
        method: 'POST',
        headers: {
          'Authorization':  vapidAuth,
          'Content-Type':   'application/octet-stream',
          'TTL':            '86400',
          'Urgency':        'normal',
        },
        body: new TextEncoder().encode(payload),
      });

      // 410 Gone = Subscription ungültig → aus DB löschen
      if (res.status === 410) {
        await supabase.from('push_subscriptions')
          .delete()
          .eq('endpoint', sub.endpoint);
      }

      return { endpoint: sub.endpoint.slice(0, 40) + '…', status: res.status };
    })
  );

  const sent    = results.filter(r => r.status === 'fulfilled' && (r.value as any).status < 300).length;
  const failed  = results.length - sent;

  return new Response(JSON.stringify({ sent, failed, total: results.length }), {
    headers: { 'Content-Type': 'application/json' }
  });
});
