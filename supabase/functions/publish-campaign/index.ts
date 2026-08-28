import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildCreatorWeek, type CampaignBrief } from '../_shared/shuffle.ts';
import { handleCors, jsonResponse } from '../_shared/wp8.ts';

type PublishDay = {
  /** YYYY-MM-DD the day posts. */
  date: string;
  /** Brief ids in slot order; every creator gets this exact layout. */
  brief_ids: string[];
};

type PublishBody = {
  campaign_id: string;
  /** Publish only reviewed briefs instead of the full week. */
  only_ready?: boolean;
  /** YYYY-MM-DD the plan starts on; defaults to the campaign drop date. */
  start_date?: string;
  /**
   * Day planner mode: the admin picked exactly which briefs post on which
   * days. Only these days publish, creators are notified immediately, and
   * the call can repeat later to add more days to the same campaign.
   */
  days?: PublishDay[];
};

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  const body = (await req.json().catch(() => null)) as PublishBody | null;
  if (!body?.campaign_id) {
    return jsonResponse({ error: 'expected { campaign_id }' }, 400);
  }
  if (body.start_date && !/^\d{4}-\d{2}-\d{2}$/.test(body.start_date)) {
    return jsonResponse({ error: 'start_date must be YYYY-MM-DD' }, 400);
  }
  const days = body.days ?? [];
  for (const day of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date)) {
      return jsonResponse({ error: 'day dates must be YYYY-MM-DD' }, 400);
    }
    if (!Array.isArray(day.brief_ids) || day.brief_ids.length === 0) {
      return jsonResponse({ error: `day ${day.date} has no briefs` }, 400);
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const authHeader = req.headers.get('Authorization') ?? '';

  // Caller-scoped client: RLS and the RPC's admin check run as the caller.
  const db = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: campaign, error: campaignError } = await db
    .from('campaigns')
    .select('id, company_id, drop_date, status')
    .eq('id', body.campaign_id)
    .maybeSingle();
  if (campaignError) {
    return jsonResponse({ error: campaignError.message }, 500);
  }
  if (!campaign) {
    return jsonResponse({ error: 'campaign not found' }, 404);
  }
  if (!campaign.drop_date) {
    return jsonResponse({ error: 'campaign has no drop_date' }, 400);
  }

  const { data: allCampaignBriefs, error: briefsError } = await db
    .from('campaign_briefs')
    .select('brief_id, created_at, briefs(format, reviewed_at, kill_reason)')
    .eq('campaign_id', campaign.id)
    .order('created_at', { ascending: true })
    .order('brief_id', { ascending: true });
  if (briefsError) {
    return jsonResponse({ error: briefsError.message }, 500);
  }
  // Partial publish (testing mode): only reviewed briefs go out; the rest
  // of the week's rows stay behind and never reach creators.
  const campaignBriefs = body.only_ready
    ? (allCampaignBriefs ?? []).filter((b) => {
        const brief = b.briefs as unknown as {
          reviewed_at?: string | null;
          kill_reason?: string | null;
        } | null;
        return brief?.reviewed_at != null && brief?.kill_reason == null;
      })
    : (allCampaignBriefs ?? []);
  if (campaignBriefs.length === 0) {
    return jsonResponse(
      {
        error: body.only_ready
          ? 'no reviewed briefs to publish'
          : 'campaign has no briefs',
      },
      400,
    );
  }

  const { data: allCreators, error: creatorsError } = await db
    .from('profiles')
    .select('id')
    .eq('company_id', campaign.company_id)
    .or('role.eq.creator,can_create.eq.true');
  if (creatorsError) {
    return jsonResponse({ error: creatorsError.message }, 500);
  }
  if (!allCreators || allCreators.length === 0) {
    return jsonResponse({ error: 'company has no creators' }, 400);
  }

  // The account gate: only creators whose fresh TikTok/Instagram accounts
  // passed the warm-up approval receive assignments.
  const { data: approvedAccounts, error: accountsError } = await db
    .from('creator_accounts')
    .select('creator_id')
    .eq('company_id', campaign.company_id)
    .eq('status', 'approved');
  if (accountsError) {
    return jsonResponse({ error: accountsError.message }, 500);
  }
  const approvedIds = new Set((approvedAccounts ?? []).map((a) => a.creator_id));
  const creators = allCreators.filter((c) => approvedIds.has(c.id));
  if (creators.length === 0) {
    return jsonResponse(
      { error: 'no creators with approved accounts; approve accounts in Review first' },
      400,
    );
  }

  const rows: Array<{
    creator_id: string;
    brief_id: string;
    scheduled_date: string;
    slot_index: number;
  }> = [];
  if (days.length > 0) {
    // Day planner mode: the admin's layout, identical for every creator.
    const ready = new Set(
      (allCampaignBriefs ?? [])
        .filter((b) => {
          const brief = b.briefs as unknown as {
            reviewed_at?: string | null;
            kill_reason?: string | null;
          } | null;
          return brief?.reviewed_at != null && brief?.kill_reason == null;
        })
        .map((b) => b.brief_id),
    );
    const seen = new Set<string>();
    for (const day of days) {
      for (const briefId of day.brief_ids) {
        if (!ready.has(briefId)) {
          return jsonResponse(
            { error: `brief ${briefId} is not a reviewed brief in this campaign` },
            400,
          );
        }
        if (seen.has(briefId)) {
          return jsonResponse(
            { error: `brief ${briefId} appears on more than one day` },
            400,
          );
        }
        seen.add(briefId);
      }
    }
    for (const creator of creators) {
      for (const day of days) {
        day.brief_ids.forEach((briefId, slotIndex) => {
          rows.push({
            creator_id: creator.id,
            brief_id: briefId,
            scheduled_date: day.date,
            slot_index: slotIndex,
          });
        });
      }
    }
  } else {
    // Legacy full-week publish: deterministic shuffle per creator. Pin to day
    // is retired; every brief shuffles as unpinned.
    const briefs: CampaignBrief[] = campaignBriefs.map((b) => ({
      brief_id: b.brief_id,
      pinned_day: null,
      format:
        (b.briefs as unknown as { format?: string } | null)?.format ?? 'video',
    }));

    const baseDate = body.start_date ?? campaign.drop_date;
    for (const creator of creators) {
      const week = buildCreatorWeek(briefs, campaign.id, creator.id);
      for (const slot of week.slots) {
        rows.push({
          creator_id: creator.id,
          brief_id: slot.brief_id,
          scheduled_date: addDays(baseDate, slot.day),
          slot_index: slot.slot_index,
        });
      }
      // Unassigned remainder stays in campaign_briefs as the swap pool.
    }
  }

  // All inserts plus the draft -> published flip commit in one transaction.
  const { data: inserted, error: publishError } = await db.rpc(
    'publish_campaign_assignments',
    { p_campaign_id: campaign.id, p_assignments: rows },
  );
  if (publishError) {
    return jsonResponse({ error: publishError.message }, 500);
  }

  // Published before Sunday 8PM EST notifies at Sunday 8PM EST (the cron
  // sweeps notify-scheduled); published after notifies immediately. A
  // partial publish, a day-planner publish, or any publish with an explicit
  // start date is for starting now, so it always notifies immediately.
  const { data: notifyAtRaw, error: notifyAtError } = await db.rpc(
    'campaign_notify_at',
    { p_drop_date: campaign.drop_date },
  );
  if (notifyAtError) {
    return jsonResponse({ error: notifyAtError.message }, 500);
  }
  const notifyAt =
    body.only_ready || body.start_date || days.length > 0
      ? new Date().toISOString()
      : String(notifyAtRaw);

  if (new Date() < new Date(notifyAt)) {
    const { error: scheduleError } = await db
      .from('campaigns')
      .update({ notify_at: notifyAt })
      .eq('id', campaign.id);
    if (scheduleError) {
      return jsonResponse({ error: scheduleError.message }, 500);
    }
    return jsonResponse({
      creators: creators.length,
      assignments_written: inserted ?? 0,
      notified: 0,
      scheduled: true,
      notify_at: notifyAt,
    });
  }

  let notified = 0;
  for (const creator of creators) {
    const res = await fetch(`${supabaseUrl}/functions/v1/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        event: 'published',
        campaign_id: campaign.id,
        creator_id: creator.id,
      }),
    }).catch(() => null);
    if (res?.ok) notified += 1;
  }

  await db
    .from('campaigns')
    .update({ notify_at: notifyAt, notified_at: new Date().toISOString() })
    .eq('id', campaign.id);

  return jsonResponse({
    creators: creators.length,
    assignments_written: inserted ?? 0,
    notified,
    scheduled: false,
    notify_at: notifyAt,
  });
});
