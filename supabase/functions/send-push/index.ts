/**
 * send-push – Supabase Edge Function
 * Deploy: supabase functions deploy send-push --no-verify-jwt
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

async function importVapidPrivateKey(pem: string): Promise<CryptoKey> {
  const cleaned = pem.replace(/\\n/g, '\n');
  // Unterstützt sowohl PKCS#8 ("PRIVATE KEY") als auch SEC1 ("EC PRIVATE KEY")
  const lines = cleaned.split('\n').filter(l => l.trim() && !l.includes('-----'));
  const der = Uint8Array.from(atob(lines.join('')), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    der.buffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
}

function b64u(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}

async function vapidJWT(endpoint: string, privPem: string, pubKey: string, subject: string): Promise<string> {
  const aud = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  const h = b64u(new TextEncoder().encode(JSON.stringify({ typ:'JWT', alg:'ES256' })));
  const p = b64u(new TextEncoder().encode(JSON.stringify({ aud, exp: now+3600, sub: subject })));
  const key = await importVapidPrivateKey(privPem);
  const sig = await crypto.subtle.sign({ name:'ECDSA', hash:'SHA-256' }, key, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(sig)}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'Authorization, Content-Type' }});
  }

  const PRIV   = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
  const PUB    = Deno.env.get('VAPID_PUBLIC_KEY')  ?? '';
  const SUBJ   = Deno.env.get('VAPID_SUBJECT')     ?? 'mailto:admin@motoroute.app';
  const SB_URL = Deno.env.get('SUPABASE_URL')      ?? '';
  const SB_SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  let body: any;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }); }

  const { user_ids, title, body: msg, url = '/', tag = 'motoroute' } = body;
  if (!user_ids?.length || !title || !msg) {
    return new Response(JSON.stringify({ error: 'user_ids, title, body required' }), { status: 400 });
  }

  const sb = createClient(SB_URL, SB_SRK);
  const { data: subs, error } = await sb
    .from('push_subscriptions')
    .select('endpoint,p256dh,auth,user_id')
    .in('user_id', user_ids);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  if (!subs?.length) return new Response(JSON.stringify({ sent: 0, message: 'No subscriptions' }), { status: 200 });

  const pushPayload = new TextEncoder().encode(
    JSON.stringify({ title, body: msg, icon: '/img/icon-192x192.png', url, tag })
  );

  const results = await Promise.allSettled(subs.map(async (sub) => {
    try {
      const jwt = await vapidJWT(sub.endpoint, PRIV, PUB, SUBJ);
      const res = await fetch(sub.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `vapid t=${jwt},k=${PUB}`,
          'Content-Type':  'application/octet-stream',
          'TTL':           '86400',
        },
        body: pushPayload,
      });
      if (res.status === 410) {
        await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      }
      return { status: res.status };
    } catch(e: any) {
      return { status: 0, error: e.message };
    }
  }));

  const sent = results.filter(r => r.status === 'fulfilled' && (r.value as any).status < 300).length;
  return new Response(
    JSON.stringify({ sent, failed: results.length - sent, total: results.length }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
