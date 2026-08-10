import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  adminClient,
  authenticate,
  generateTaskDraft,
  handleCors,
  jsonResponse,
  loadBrandContext,
} from '../_shared/wp8.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const ACTIVE_STATUSES = ['assigned', 'recorded', 'submitted', 'changes_requested'];
const MAX_NEW_PER_CREATOR = 5;
const TREND_MAX_AGE_DAYS = 45;

type TrendRow = {
  id: string;
  platform: string | null;
  hook: string | null;
  transcript: string | null;
  why_it_works: string | null;
  views: number | null;
  format: string | null;
  caption: string | null;
  slide_texts: unknown;
  remake_mode: string | null;
  remake_reason: string | null;
};

function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function fillCompany(admin: SupabaseClient, companyId: string): Promise<number> {
  const [{ data: company }, { data: creators }, brand] = await Promise.all([
    admin.from('companies').select('settings').eq('id', companyId).single(),
    admin
      .from('profiles')
      .select('id')
      .eq('company_id', companyId)
      .or('role.eq.creator,can_create.eq.true')
      .eq('onboarded', true),
    loadBrandContext(admin, companyId),
  ]);
  if (!creators?.length) return 0;

  const settings = (company?.settings ?? {}) as { cadence_per_week?: number };
  const cadence = Math.min(settings.cadence_per_week ?? 3, 7);

  const since = new Date();
  since.setDate(since.getDate() - TREND_MAX_AGE_DAYS);
  // Relevance-first: gate-passing trends only, best scores first. Ungated
  // items (scraped before the gate existed) stay eligible.
  const { data: trends } = await admin
    .from('trend_items')
    .select(
      'id, platform, hook, transcript, why_it_works, views, format, caption, slide_texts, remake_mode, remake_reason',
    )
    .eq('company_id', companyId)
    .gte('scraped_at', since.toISOString())
    .or('relevance_score.is.null,relevance_score.gte.6')
    .order('relevance_score', { ascending: false, nullsFirst: false })
    .order('views', { ascending: false })
    .limit(50);
  if (!trends?.length) return 0;

  const { data: recentTasks } = await admin
    .from('content_tasks')
    .select('assigned_to, inspiration_trend_id, status, due_date')
    .eq('company_id', companyId);

  // Rotating cursor so creators in the same run get different trends.
  let cursor = 0;
  const takeTrendFor = (usedIds: Set<string>): TrendRow | null => {
    for (let step = 0; step < trends.length; step += 1) {
      const t = trends[(cursor + step) % trends.length] as TrendRow;
      if (!usedIds.has(t.id)) {
        cursor = (cursor + step + 1) % trends.length;
        usedIds.add(t.id);
        return t;
      }
    }
    return null;
  };

  let created = 0;
  for (const creator of creators) {
    const mine = (recentTasks ?? []).filter((t) => t.assigned_to === creator.id);
    const active = mine.filter((t) => ACTIVE_STATUSES.includes(t.status)).length;
    const deficit = Math.min(cadence - active, MAX_NEW_PER_CREATOR);
    if (deficit <= 0) continue;

    const usedIds = new Set(
      mine
        .map((t) => t.inspiration_trend_id)
        .filter((id): id is string => Boolean(id)),
    );

    for (let i = 0; i < deficit; i += 1) {
      const trend = takeTrendFor(usedIds);
      if (!trend) break;
      try {
        const draft = await generateTaskDraft(brand, trend);
        const { error } = await admin.from('content_tasks').insert({
          company_id: companyId,
          assigned_to: creator.id,
          created_by: null,
          // Legacy pipeline, replaced by the weekly batch flow. Explicitly
          // released so the release gate constraint holds until it is torn out.
          planning_status: 'scheduled',
          title: draft.title,
          script: draft.script,
          caption: draft.caption,
          brief: draft.brief,
          format: draft.format,
          estimated_seconds: draft.estimatedSeconds,
          inspiration_trend_id: trend.id,
          due_date: isoDaysFromNow(i + 1),
          status: 'assigned',
          // Snapshot for approval-time edit diffs and win attribution.
          original_draft: {
            title: draft.title,
            script: draft.script,
            caption: draft.caption,
            brief: draft.brief,
          },
          generation_meta: {
            source: 'auto_fill',
            archetype: 'trend_adaptation',
            source_trend_id: trend.id,
            remake_mode: trend.remake_mode,
          },
        });
        if (error) throw error;
        created += 1;
      } catch (e) {
        console.error(`auto-fill task failed for creator ${creator.id}:`, e);
      }
    }
  }
  return created;
}

async function run(companyIds: string[]): Promise<void> {
  const admin = adminClient();
  for (const id of companyIds) {
    try {
      const n = await fillCompany(admin, id);
      console.log(`auto-fill: ${n} tasks created for ${id}`);
    } catch (e) {
      console.error(`auto-fill failed for ${id}:`, e);
    }
  }
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  const admin = adminClient();
  const caller = await authenticate(req, admin);
  if (!caller) return jsonResponse({ error: 'unauthorized' }, 401);
  if (caller.kind === 'user' && caller.role !== 'admin') {
    return jsonResponse({ error: 'forbidden' }, 403);
  }

  let companyIds: string[];
  if (caller.kind === 'user') {
    companyIds = [caller.companyId];
  } else {
    const { data } = await admin.from('brand_profiles').select('company_id');
    companyIds = [...new Set((data ?? []).map((r) => r.company_id))];
  }

  EdgeRuntime.waitUntil(run(companyIds));
  return jsonResponse({ started: true, companies: companyIds.length }, 202);
});
