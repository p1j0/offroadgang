/**
 * delete-user – Supabase Edge Function
 * Deletes a user account completely (auth + all data).
 * Caller must be a site admin (verified via JWT).
 *
 * Deploy: supabase functions deploy delete-user
 *  (JWT verification ON — caller must pass their own Bearer token)
 *
 * Body: { user_id: string }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SB_URL  = Deno.env.get('SUPABASE_URL')               ?? '';
const SB_SRK  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')  ?? '';
const SB_ANON = Deno.env.get('SUPABASE_ANON_KEY')          ?? '';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // ── 1. Identify the caller from their JWT ──────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  const callerToken = authHeader.replace(/^Bearer\s+/i, '');
  if (!callerToken) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
  }

  // Use the anon client + caller token to get the caller's user id
  const callerSb = createClient(SB_URL, SB_ANON, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
  });
  const { data: { user: callerUser }, error: authErr } = await callerSb.auth.getUser();
  if (authErr || !callerUser) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: CORS });
  }

  // ── 2. Verify caller is site admin ─────────────────────────────────────────
  const adminSb = createClient(SB_URL, SB_SRK);
  const { data: adminRow } = await adminSb
    .from('site_admins')
    .select('user_id')
    .eq('user_id', callerUser.id)
    .maybeSingle();

  if (!adminRow) {
    return new Response(JSON.stringify({ error: 'Forbidden – site admin only' }), { status: 403, headers: CORS });
  }

  // ── 3. Parse target user ID ────────────────────────────────────────────────
  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: CORS });
  }

  const { user_id: targetId } = body;
  if (!targetId || typeof targetId !== 'string') {
    return new Response(JSON.stringify({ error: 'user_id required' }), { status: 400, headers: CORS });
  }

  // Prevent self-deletion
  if (targetId === callerUser.id) {
    return new Response(JSON.stringify({ error: 'Eigenen Account nicht löschbar' }), { status: 400, headers: CORS });
  }

  // ── 4. Clean up application data first ────────────────────────────────────
  await Promise.allSettled([
    adminSb.from('push_subscriptions').delete().eq('user_id', targetId),
    adminSb.from('tour_checkins').delete().eq('user_id', targetId),
    adminSb.from('tour_members').delete().eq('user_id', targetId),
    adminSb.from('community_members').delete().eq('user_id', targetId),
    adminSb.from('site_admins').delete().eq('user_id', targetId),
  ]);

  // Nullify messages / change_log so they become "Gelöschter User" entries
  await Promise.allSettled([
    adminSb.from('messages').update({ username: '[gelöscht]' }).eq('user_id', targetId),
    adminSb.from('community_messages').update({ username: '[gelöscht]' }).eq('user_id', targetId),
    adminSb.from('change_log').update({ username: '[gelöscht]' }).eq('user_id', targetId),
  ]);

  // ── 5. Delete from auth (cascades to profiles via FK) ─────────────────────
  const { error: delErr } = await adminSb.auth.admin.deleteUser(targetId);
  if (delErr) {
    console.error('[delete-user] auth.admin.deleteUser error:', delErr);
    return new Response(JSON.stringify({ error: delErr.message }), { status: 500, headers: CORS });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
