// Deferred publish pushes. A campaign published before Sunday 8PM EST gets
// notify_at stamped by publish-campaign instead of an immediate push; the
// hourly cron sweeps here and fires the "new week is live" push once notify_at
// is due. Claims via notified_at (update ... where notified_at is null) so a
// concurrent run cannot double-send. Cron-authenticated; admins may also call
// it manually.

import { adminClient, authenticate, handleCors, jsonResponse } from '../_shared/wp8.ts';
import { creatorPushTokens, sendExpoPush } from '../_shared/push.ts';

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  const admin = adminClient();
  const caller = await authenticate(req, admin);
  if (!caller) return jsonResponse({ error: 'unauthorized' }, 401);
  if (caller.kind === 'user' && caller.role !== 'admin') {
    return jsonResponse({ error: 'forbidden' }, 403);
  }

  try {
    const { data: due, error } = await admin
      .from('campaigns')
      .select('id, company_id')
      .eq('status', 'published')
      .not('notify_at', 'is', null)
      .is('notified_at', null)
      .lte('notify_at', new Date().toISOString());
    if (error) throw new Error(error.message);

    let campaigns = 0;
    let pushes = 0;
    for (const campaign of due ?? []) {
      const { data: claimed } = await admin
        .from('campaigns')
        .update({ notified_at: new Date().toISOString() })
        .eq('id', campaign.id)
        .is('notified_at', null)
        .select('id');
      if (!claimed || claimed.length === 0) continue;
      campaigns += 1;

      const { data: assignments } = await admin
        .from('assignments')
        .select('creator_id')
        .eq('campaign_id', campaign.id);
      const creatorIds = [...new Set((assignments ?? []).map((a) => a.creator_id))];
      for (const creatorId of creatorIds) {
        const tokens = await creatorPushTokens(admin, creatorId, campaign.company_id);
        pushes += await sendExpoPush(tokens, {
          title: 'New week is live',
          body: 'Your posts for this week are ready',
          data: { campaign_id: campaign.id, event: 'published' },
        });
      }
    }
    return jsonResponse({ campaigns, pushes });
  } catch (e) {
    console.error('notify-scheduled error:', e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : 'notify-scheduled failed' },
      500,
    );
  }
});
