// Push for a newly published library brief. Called by the
// library_briefs_notify_published trigger (migration 129) through pg_net with
// the cron secret. The trigger already wrote one notifications row per
// creator for the in-app feed, so this only sends the Expo push, skipping
// creators whose notification_prefs turn "briefs" off.

import { adminClient, authenticate, handleCors, jsonResponse } from '../_shared/wp8.ts';

type BriefRow = { id: string; company_id: string; kind: string; type: string; title: string; from_id: string | null; created_by: string | null };
type MemberRow = { profile_id: string; role: string; can_create: boolean };
type ProfileRow = { id: string; expo_push_token: string | null; notification_prefs: Record<string, unknown> | null };

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const admin = adminClient();
  const caller = await authenticate(req, admin);
  if (!caller || caller.kind !== 'cron') return jsonResponse({ error: 'unauthorized' }, 401);

  let briefId = '';
  try {
    const body = await req.json();
    briefId = typeof body?.brief_id === 'string' ? body.brief_id : '';
  } catch {
    // fall through
  }
  if (!briefId) return jsonResponse({ error: 'brief_id required' }, 400);

  const { data: brief, error: briefErr } = await admin
    .from('library_briefs')
    .select('id, company_id, kind, type, title, from_id, created_by')
    .eq('id', briefId)
    .maybeSingle<BriefRow>();
  if (briefErr) return jsonResponse({ error: briefErr.message }, 500);
  if (!brief) return jsonResponse({ sent: 0, skipped: 'not found' });
  if (brief.kind === 'Outline' && brief.from_id) return jsonResponse({ sent: 0, skipped: 'twin' });

  const { data: members, error: memErr } = await admin
    .from('company_members')
    .select('profile_id, role, can_create')
    .eq('company_id', brief.company_id)
    .is('removed_at', null);
  if (memErr) return jsonResponse({ error: memErr.message }, 500);
  const ids = ((members ?? []) as MemberRow[])
    .filter((m) => (m.role === 'creator' || m.can_create) && m.profile_id !== brief.created_by)
    .map((m) => m.profile_id);
  if (ids.length === 0) return jsonResponse({ sent: 0 });

  const { data: profiles, error: profErr } = await admin.from('profiles').select('id, expo_push_token, notification_prefs').in('id', ids);
  if (profErr) return jsonResponse({ error: profErr.message }, 500);
  const tokens = ((profiles ?? []) as ProfileRow[])
    .filter((p) => !!p.expo_push_token && !(p.notification_prefs && p.notification_prefs.briefs === false))
    .map((p) => p.expo_push_token as string);
  if (tokens.length === 0) return jsonResponse({ sent: 0 });

  const deepLink = `noni://creator/${brief.company_id}/briefs/${brief.id}`;
  const body = brief.kind === 'Outline' ? `New outline: ${brief.title}` : `New ${brief.type} post: ${brief.title}`;
  const data = { event: 'brief_published', company_id: brief.company_id, deep_link: deepLink, brief_id: brief.id, type: brief.type, kind: brief.kind };

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tokens.map((to) => ({ to, title: 'New brief', body, sound: 'default', data }))),
  });
  if (!res.ok) return jsonResponse({ error: `expo push failed: ${res.status} ${await res.text()}` }, 502);
  return jsonResponse({ sent: tokens.length });
});
