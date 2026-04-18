// supabase/functions/notify-users/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SITE_URL       = Deno.env.get('SITE_URL') ?? 'https://motoroute.app';
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const OFFLINE_MINUTES = 10;
const COOLDOWN_HOURS  = 24;

Deno.serve(async (req) => {
  try {
    const result = await runNotifications();
    return new Response(JSON.stringify({ ok: true, debug: result }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('notify-users fatal error:', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});

async function runNotifications() {
  const now        = new Date();
  const offlineCut = new Date(now.getTime() - OFFLINE_MINUTES * 60 * 1000);

  console.log(`[run] now=${now.toISOString()} offlineCut=${offlineCut.toISOString()}`);

  const { data: profiles, error } = await sb
    .from('profiles')
    .select('id, username, notification_email, notify_chat, notify_changes, last_notified_at, last_seen_at')
    .neq('notification_email', '')
    .not('notification_email', 'is', null)
    .or(`notify_chat.eq.true,notify_changes.eq.true`)
    .or(`last_seen_at.is.null,last_seen_at.lt.${offlineCut.toISOString()}`);

  if (error) {
    console.error('[run] profiles fetch error:', error);
    throw new Error('profiles fetch: ' + error.message);
  }

  console.log(`[run] found ${profiles?.length ?? 0} candidate profiles`);
  profiles?.forEach(p => console.log(`  → ${p.username} | last_seen=${p.last_seen_at} | last_notified=${p.last_notified_at} | email=${p.notification_email}`));

  if (!profiles?.length) return { profilesFound: 0 };

  const results = await Promise.allSettled(profiles.map(p => processUser(p, now)));
  return { profilesFound: profiles.length, results: results.map(r => r.status) };
}

async function processUser(profile: any, now: Date) {
  const tag = `[user:${profile.username}]`;
  const lastNotified = profile.last_notified_at ? new Date(profile.last_notified_at) : new Date(0);
  const lastSeen     = profile.last_seen_at     ? new Date(profile.last_seen_at)     : new Date(0);
  const cooldownCut  = new Date(now.getTime() - COOLDOWN_HOURS * 60 * 60 * 1000);

  // If the user logged in AFTER the last notification, they have seen the events
  // → reset cooldown so new events after re-logout trigger a fresh mail
  const loggedInSinceLastMail = lastSeen > lastNotified;

  console.log(`${tag} lastNotified=${lastNotified.toISOString()} lastSeen=${lastSeen.toISOString()} loggedInSince=${loggedInSinceLastMail}`);

  if (!loggedInSinceLastMail && lastNotified > cooldownCut) {
    console.log(`${tag} SKIP – 24h cooldown active, user has not logged in since last mail`);
    return;
  }
  if (loggedInSinceLastMail) {
    console.log(`${tag} Cooldown reset – user logged in and back offline since last mail`);
  }

  // Cutoff: events after last_seen_at (= when user went offline again)
  // If never notified or user logged in since: use last_seen_at
  // Otherwise: use last_notified_at to avoid re-sending already-notified events
  const since = loggedInSinceLastMail ? lastSeen : (lastSeen > lastNotified ? lastSeen : lastNotified);
  console.log(`${tag} since=${since.toISOString()}`);

  const [tourIds, communityIds] = await Promise.all([
    getUserTourIds(profile.id),
    getUserCommunityIds(profile.id),
  ]);
  console.log(`${tag} tourIds: ${tourIds.join(', ') || 'none'}`);
  console.log(`${tag} communityIds: ${communityIds.join(', ') || 'none'}`);
  if (!tourIds.length && !communityIds.length) return;

  const sections: EmailSection[] = [];

  // Chat messages
  if (profile.notify_chat) {
    const { data: msgs, error: msgErr } = await sb
      .from('messages')
      .select('tour_id, username, text, created_at')
      .in('tour_id', tourIds)
      .neq('user_id', profile.id)
      .gt('created_at', since.toISOString())
      .order('created_at', { ascending: true });

    if (msgErr) console.error(`${tag} messages error:`, msgErr);
    console.log(`${tag} new messages: ${msgs?.length ?? 0}`);

    if (msgs?.length) {
      const byTour   = groupBy(msgs, 'tour_id');
      const tourNames = await getTourNames(Object.keys(byTour));
      for (const [tourId, tourMsgs] of Object.entries(byTour)) {
        sections.push({
          icon: '💬',
          title: `${tourMsgs.length} neue Nachricht${tourMsgs.length > 1 ? 'en' : ''} in „${tourNames[tourId] ?? '…'}"`,
          tourId,
          items: (tourMsgs as any[]).slice(0, 5).map(m => ({
            label: m.username,
            value: m.text.length > 100 ? m.text.slice(0, 100) + '…' : m.text,
            time:  m.created_at,
          })),
          more: Math.max(0, (tourMsgs as any[]).length - 5),
        });
      }
    }
  }

  // Changelog
  if (profile.notify_changes) {
    const { data: changes, error: chgErr } = await sb
      .from('change_log')
      .select('tour_id, username, field, old_value, new_value, created_at')
      .in('tour_id', tourIds)
      .neq('user_id', profile.id)
      .gt('created_at', since.toISOString())
      .order('created_at', { ascending: true });

    if (chgErr) console.error(`${tag} change_log error:`, chgErr);
    console.log(`${tag} new changes: ${changes?.length ?? 0}`);

    if (changes?.length) {
      const byTour   = groupBy(changes, 'tour_id');
      const tourNames = await getTourNames(Object.keys(byTour));
      for (const [tourId, tourChanges] of Object.entries(byTour)) {
        sections.push({
          icon: '📋',
          title: `${tourChanges.length} Änderung${tourChanges.length > 1 ? 'en' : ''} in „${tourNames[tourId] ?? '…'}"`,
          tourId,
          items: (tourChanges as any[]).slice(0, 5).map(c => ({
            label: `${c.username} → ${c.field}`,
            value: c.new_value || '—',
            time:  c.created_at,
          })),
          more: Math.max(0, (tourChanges as any[]).length - 5),
        });
      }
    }
  }

  // ── Community chat messages ──────────────────────────────────────────────
  if (profile.notify_chat) {
    const { data: cmsgs, error: cmErr } = await sb
      .from('community_messages')
      .select('community_id, username, text, created_at')
      .neq('user_id', profile.id)
      .gt('created_at', since.toISOString())
      .order('created_at', { ascending: true });

    if (cmErr) console.error(`${tag} community_messages error:`, cmErr);

    if (cmsgs?.length) {
      // Group by community — only include communities the user belongs to
      const byCommunity = groupBy(cmsgs.filter(m =>
        communityIds.includes(m.community_id)
      ), 'community_id');
      const commNames = await getCommunityNames(Object.keys(byCommunity));

      for (const [cid, msgs] of Object.entries(byCommunity)) {
        sections.push({
          icon:  '💬',
          title: `${msgs.length} neue Nachricht${msgs.length > 1 ? 'en' : ''} in Planung „${commNames[cid] ?? '…'}"`,
          tourId: cid,
          items: (msgs as any[]).slice(0, 5).map(m => ({
            label: m.username,
            value: m.text.length > 100 ? m.text.slice(0, 100) + '…' : m.text,
            time:  m.created_at,
          })),
          more: Math.max(0, (msgs as any[]).length - 5),
        });
      }
    }
  }

  // ── Community polls ────────────────────────────────────────────────────────
  if (profile.notify_changes) {
    const { data: polls, error: plErr } = await sb
      .from('community_polls')
      .select('community_id, username, question, created_at')
      .neq('user_id', profile.id)
      .gt('created_at', since.toISOString())
      .order('created_at', { ascending: true });

    if (plErr) console.error(`${tag} community_polls error:`, plErr);

    if (polls?.length) {
      const byCommunity = groupBy(polls.filter(p =>
        communityIds.includes(p.community_id)
      ), 'community_id');
      const commNames = await getCommunityNames(Object.keys(byCommunity));

      for (const [cid, cpolls] of Object.entries(byCommunity)) {
        sections.push({
          icon:  '📋',
          title: `${cpolls.length} neue Abfrage${cpolls.length > 1 ? 'n' : ''} in Planung „${commNames[cid] ?? '…'}"`,
          tourId: cid,
          items: (cpolls as any[]).slice(0, 5).map(p => ({
            label: p.username,
            value: p.question,
            time:  p.created_at,
          })),
          more: Math.max(0, (cpolls as any[]).length - 5),
        });
      }
    }
  }

  // ── Tour media ──────────────────────────────────────────────────────────
  if (profile.notify_changes) {
    const { data: tmedia, error: tmErr } = await sb
      .from('tour_media')
      .select('tour_id, username, media_type, caption, created_at')
      .neq('user_id', profile.id)
      .gt('created_at', since.toISOString())
      .in('tour_id', tourIds)
      .order('created_at', { ascending: true });

    if (tmErr) console.error(`${tag} tour_media error:`, tmErr);

    if (tmedia?.length) {
      const byTour = groupBy(tmedia, 'tour_id');
      const tourNames2 = await getTourNames(Object.keys(byTour));
      for (const [tid, items] of Object.entries(byTour)) {
        sections.push({
          icon:  '📸',
          title: `${(items as any[]).length} neues Media in „${tourNames2[tid] ?? '…'}"`,
          tourId: tid,
          items: (items as any[]).slice(0, 5).map((m: any) => ({
            label: m.username,
            value: m.media_type === 'youtube' ? 'YouTube-Video' : m.media_type === 'video' ? 'Video' : 'Bild',
            time:  m.created_at,
          })),
          more: Math.max(0, (items as any[]).length - 5),
        });
      }
    }
  }

  // ── Community media ────────────────────────────────────────────────────────
  if (profile.notify_changes) {
    const { data: cmedia, error: cmErr } = await sb
      .from('community_media')
      .select('community_id, username, media_type, caption, created_at')
      .neq('user_id', profile.id)
      .gt('created_at', since.toISOString())
      .order('created_at', { ascending: true });

    if (cmErr) console.error(`${tag} community_media error:`, cmErr);

    if (cmedia?.length) {
      const byCommunity2 = groupBy(cmedia.filter((m: any) =>
        communityIds.includes(m.community_id)
      ), 'community_id');
      const commNames2 = await getCommunityNames(Object.keys(byCommunity2));
      for (const [cid, items] of Object.entries(byCommunity2)) {
        sections.push({
          icon:  '📸',
          title: `${(items as any[]).length} neues Media in „${commNames2[cid] ?? '…'}"`,
          tourId: cid,
          items: (items as any[]).slice(0, 5).map((m: any) => ({
            label: m.username,
            value: m.media_type === 'youtube' ? 'YouTube-Video' : m.media_type,
            time:  m.created_at,
          })),
          more: Math.max(0, (items as any[]).length - 5),
        });
      }
    }
  }

  console.log(`${tag} sections to send: ${sections.length}`);
  if (!sections.length) return;

  const subject = `🏍️ ${sections.length} Neuigkeit${sections.length > 1 ? 'en' : ''} in MotoRoute`;
  const html    = buildEmail(profile.username, sections);

  console.log(`${tag} sending to ${profile.notification_email}...`);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from:    'MotoRoute <onboarding@resend.dev>',
      to:      profile.notification_email,
      subject,
      html,
    }),
  });

  const resBody = await res.text();
  if (!res.ok) {
    console.error(`${tag} Resend HTTP ${res.status}: ${resBody}`);
    return;
  }

  console.log(`${tag} mail sent OK: ${resBody}`);

  await sb.from('profiles')
    .update({ last_notified_at: now.toISOString() })
    .eq('id', profile.id);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getUserTourIds(userId: string): Promise<string[]> {
  const [adminRes, memberRes] = await Promise.all([
    sb.from('tours').select('id, co_admin_ids').filter('admin_id', 'eq', userId),
    sb.from('tour_members').select('tour_id').eq('user_id', userId),
  ]);
  const fromAdmin  = (adminRes.data || []).map((t: any) => t.id);
  const fromMember = (memberRes.data || []).map((m: any) => m.tour_id);
  return [...new Set([...fromAdmin, ...fromMember])];
}

async function getUserCommunityIds(userId: string): Promise<string[]> {
  const [adminRes, memberRes] = await Promise.all([
    sb.from('communities').select('id').filter('admin_id', 'eq', userId),
    sb.from('community_members').select('community_id').eq('user_id', userId),
  ]);
  const fromAdmin  = (adminRes.data || []).map((c: any) => c.id);
  const fromMember = (memberRes.data || []).map((m: any) => m.community_id);
  return [...new Set([...fromAdmin, ...fromMember])];
}

async function getCommunityNames(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const { data } = await sb.from('communities').select('id, name').in('id', ids);
  return Object.fromEntries((data || []).map((c: any) => [c.id, c.name]));
}

async function getTourNames(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const { data } = await sb.from('tours').select('id, name').in('id', ids);
  return Object.fromEntries((data || []).map((t: any) => [t.id, t.name]));
}

function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = String(item[key]);
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

interface EmailItem    { label: string; value: string; time: string; }
interface EmailSection { icon: string; title: string; tourId: string; items: EmailItem[]; more: number; }

function buildEmail(username: string, sections: EmailSection[]): string {
  const sectionsHtml = sections.map(s => {
    const rows = s.items.map(item => {
      const dt   = new Date(item.time);
      const time = dt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      const date = dt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
      return `<tr>
        <td style="padding:6px 14px 6px 0;vertical-align:top;color:#7a7880;font-size:12px;white-space:nowrap">${date} ${time}</td>
        <td style="padding:6px 10px 6px 0;vertical-align:top;color:#aaa;font-size:12px;white-space:nowrap">${esc(item.label)}</td>
        <td style="padding:6px 0;vertical-align:top;color:#eeebe4;font-size:13px">${esc(item.value)}</td>
      </tr>`;
    }).join('');
    const ctaUrl = `${SITE_URL}/#join=${s.tourId}`;
    return `<div style="margin-bottom:24px;background:#1e1e25;border-radius:8px;overflow:hidden">
      <div style="background:#2a2a35;padding:12px 18px;font-size:14px;font-weight:600;color:#eeebe4">${s.icon} ${esc(s.title)}</div>
      <div style="padding:12px 18px">
        <table cellpadding="0" cellspacing="0" style="width:100%">${rows}</table>
        ${s.more > 0 ? `<p style="margin:8px 0 0;color:#7a7880;font-size:12px">… und ${s.more} weitere</p>` : ''}
        <div style="margin-top:14px">
          <a href="${ctaUrl}" style="display:inline-block;background:#f07800;color:#000;text-decoration:none;font-weight:700;padding:8px 20px;border-radius:6px;font-size:13px">Tour öffnen →</a>
        </div>
      </div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0d0d10;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table width="580" cellpadding="0" cellspacing="0" style="background:#16161a;border:1px solid #2a2a35;border-radius:12px;overflow:hidden;max-width:100%">
  <tr><td style="background:linear-gradient(135deg,#f07800,#b85c00);padding:24px 32px">
    <div style="font-size:26px;font-weight:900;letter-spacing:3px;color:#000">MOTO<span style="color:#fff">ROUTE</span></div>
  </td></tr>
  <tr><td style="padding:28px 32px 16px">
    <h1 style="margin:0 0 6px;font-size:20px;color:#eeebe4;font-weight:600">Hey ${esc(username)}, es gibt Neuigkeiten!</h1>
    <p style="margin:0;color:#7a7880;font-size:13px">Folgendes ist passiert, während du weg warst:</p>
  </td></tr>
  <tr><td style="padding:0 32px 24px">${sectionsHtml}</td></tr>
  <tr><td style="padding:16px 32px 24px;border-top:1px solid #2a2a35">
    <p style="margin:0;font-size:11px;color:#7a7880">Du erhältst diese E-Mail, weil du Mitglied dieser Touren bist.<br>Benachrichtigungen können im Profil deaktiviert werden.</p>
  </td></tr>
</table></td></tr></table></body></html>`;
}

function esc(s: string): string {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
