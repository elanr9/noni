// Scout: Noni finds creators for a company outside Noni. See engine.ts.
//
// POST { action: 'start', brief, platforms?, seeds?, min_followers?, max_followers?, company_id? }
//   Campaign managers for their company; the platform admin for any company
//   (company_id). Creates the run and plans it in the background.
//   200 { run }
// POST { action: 'tick', run_id? }
//   Advances a run one step in the background. Cron (x-cron-secret) with no
//   run_id advances every active run. 202 { ok }

import { adminClient, authenticate, handleCors, jsonResponse } from '../_shared/wp8.ts';
import { cleanHandle, makePlan, tick, type Platform } from './engine.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const ACTIVE = ['planning', 'searching', 'enriching', 'vetting'];
// Runs a company can start itself in 30 days (each one costs real money).
const COMPANY_RUNS_PER_MONTH = 8;

type Body = {
  action?: string;
  company_id?: string;
  run_id?: string;
  brief?: string;
  platforms?: string[];
  seeds?: string[];
  min_followers?: number | null;
  max_followers?: number | null;
};

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  const admin = adminClient();
  const caller = await authenticate(req, admin);
  if (!caller) return jsonResponse({ error: 'unauthorized' }, 401);
  const body = ((await req.json().catch(() => null)) ?? {}) as Body;

  // ---------------------------------------------------------------- tick
  if (body.action === 'tick') {
    let ids: string[] = [];
    if (body.run_id) {
      const { data: run } = await admin.from('scout_runs').select('id, company_id').eq('id', body.run_id).maybeSingle();
      if (!run) return jsonResponse({ error: 'not found' }, 404);
      if (caller.kind === 'user' && !caller.platformAdmin && (caller.companyId !== run.company_id || caller.role !== 'campaign_manager')) {
        return jsonResponse({ error: 'forbidden' }, 403);
      }
      ids = [run.id];
    } else {
      if (caller.kind !== 'cron') return jsonResponse({ error: 'run_id is required' }, 400);
      const { data } = await admin.from('scout_runs').select('id').in('status', ACTIVE).limit(20);
      ids = (data ?? []).map((r) => r.id as string);
    }
    EdgeRuntime.waitUntil(Promise.all(ids.map((id) => tick(admin, id))));
    return jsonResponse({ ok: true, runs: ids.length }, 202);
  }

  // ---------------------------------------------------------------- start
  if (body.action !== 'start') return jsonResponse({ error: 'unknown action' }, 400);
  if (caller.kind !== 'user') return jsonResponse({ error: 'unauthorized' }, 401);
  let companyId = caller.companyId;
  if (caller.platformAdmin && body.company_id) companyId = body.company_id;
  else if (caller.role !== 'campaign_manager') return jsonResponse({ error: 'forbidden' }, 403);
  if (!companyId) return jsonResponse({ error: 'no active company' }, 400);

  const { data: active } = await admin.from('scout_runs').select('*').eq('company_id', companyId).in('status', ACTIVE)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (active) return jsonResponse({ run: active, started: false });

  if (!caller.platformAdmin) {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { count } = await admin.from('scout_runs').select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).gte('created_at', since);
    if ((count ?? 0) >= COMPANY_RUNS_PER_MONTH) {
      return jsonResponse({ error: 'You have used this month\'s searches. Noni can run more for you.' }, 429);
    }
  }

  const platforms = (body.platforms ?? ['tiktok', 'instagram']).filter((p): p is Platform => p === 'tiktok' || p === 'instagram');
  if (!platforms.length) return jsonResponse({ error: 'Pick TikTok or Instagram' }, 400);
  const seeds = [...new Set((body.seeds ?? []).map(cleanHandle).filter((s) => /^[a-z0-9._]{2,40}$/.test(s)))].slice(0, 5);
  const brief = (body.brief ?? '').trim().slice(0, 600);
  const bound = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.round(n) : null);

  const { data: run, error } = await admin.from('scout_runs').insert({
    company_id: companyId,
    brief,
    plan: {},
    status: 'planning',
    created_by: caller.userId,
    // Held while the plan is written so the cron does not plan it twice.
    lease_until: new Date(Date.now() + 140_000).toISOString(),
  }).select('*').single();
  if (error || !run) return jsonResponse({ error: error?.message ?? 'Could not start' }, 500);

  EdgeRuntime.waitUntil((async () => {
    try {
      const plan = await makePlan(admin, companyId, brief, {
        platforms,
        seeds,
        min_followers: bound(body.min_followers),
        max_followers: bound(body.max_followers),
      });
      await admin.from('scout_runs').update({ plan, lease_until: null, updated_at: new Date().toISOString() }).eq('id', run.id);
      await tick(admin, run.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('scout plan', message);
      await admin.from('scout_runs').update({ status: 'failed', error: message.slice(0, 500), lease_until: null }).eq('id', run.id);
    }
  })());
  return jsonResponse({ run, started: true });
});
