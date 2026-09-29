// Starts the industry deep dive for the caller's company. Campaign managers.
// { website? } (defaults to companies.website). Answers at once with the
// research row; progress and the result land on company_research, which the
// web Brain page polls. A run already in flight is never started twice, and
// a finished run is reused for an hour unless { force: true }.

import {
  adminClient,
  authenticate,
  handleCors,
  jsonResponse,
} from '../_shared/wp8.ts';
import { assertSafePublicHttpUrl } from '../_shared/crawlSite.ts';
import { runCompanyResearch } from '../_shared/companyResearch.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

type Body = { website?: string; force?: boolean };

// Background work is cut off at the platform wall clock; a run still marked
// running after this long died and may be restarted.
const STALE_RUN_MS = 8 * 60 * 1000;
const REUSE_MS = 60 * 60 * 1000;

function normalizeWebsite(raw: string): string {
  const trimmed = raw.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  const admin = adminClient();
  const caller = await authenticate(req, admin);
  if (!caller || caller.kind !== 'user') return jsonResponse({ error: 'unauthorized' }, 401);
  if (caller.role !== 'campaign_manager') return jsonResponse({ error: 'forbidden' }, 403);
  const companyId = caller.companyId;
  const body = ((await req.json().catch(() => null)) ?? {}) as Body;

  const [{ data: company }, { data: current }] = await Promise.all([
    admin.from('companies').select('website').eq('id', companyId).single(),
    admin.from('company_research').select('*').eq('company_id', companyId).maybeSingle(),
  ]);
  const rawWebsite = body.website?.trim() || (company?.website as string | null) || '';
  if (!rawWebsite) return jsonResponse({ error: 'Add your website first' }, 400);
  const website = normalizeWebsite(rawWebsite);
  try {
    assertSafePublicHttpUrl(website);
  } catch {
    return jsonResponse({ error: 'That website address does not look right' }, 400);
  }

  const now = Date.now();
  const startedAt = current?.started_at ? Date.parse(current.started_at) : 0;
  const finishedAt = current?.finished_at ? Date.parse(current.finished_at) : 0;
  if (current?.status === 'running' && now - startedAt < STALE_RUN_MS) {
    return jsonResponse({ research: current, started: false });
  }
  if (
    !body.force &&
    current?.status === 'done' &&
    current.website === website &&
    now - finishedAt < REUSE_MS
  ) {
    return jsonResponse({ research: current, started: false });
  }

  if (body.website?.trim() && !company?.website) {
    await admin.from('companies').update({ website }).eq('id', companyId);
  }
  const { data: row, error } = await admin
    .from('company_research')
    .upsert(
      {
        company_id: companyId,
        website,
        status: 'running',
        stage: 'Starting',
        error: null,
        started_at: new Date().toISOString(),
        finished_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'company_id' },
    )
    .select('*')
    .single();
  if (error) return jsonResponse({ error: error.message }, 500);

  EdgeRuntime.waitUntil(runCompanyResearch(admin, companyId, website));
  return jsonResponse({ research: row, started: true }, 202);
});
