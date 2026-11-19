// Analyzes one reference post for the caller's company. Campaign managers.
// POST { url, force? }. Answers at once and never holds the request open:
//   { status: 'pending', phase }   202, the analysis is running; call again to poll
//   { status: 'done', analysis }   200, the stored ReferenceAnalysis
//   { status: 'failed', reason }   200, with a reason the manager can act on
// The first call for a link starts the analysis in the background (scrape,
// transcript, frames and the vision call take one to three minutes). Calling
// again with the same body polls it. A failed analysis is not retried on a
// poll; send { force: true } to run it again (also re-runs a finished one).

import { adminClient, authenticate, handleCors, jsonResponse } from '../_shared/wp8.ts';
import { socialHost } from '../_shared/scrapeSocial.ts';
import { analyzeReference, getAnalysisState, markAnalysisPending, STALE_RUN_MS } from '../_shared/ai/reference.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

type Body = { url?: string; force?: boolean };

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  const admin = adminClient();
  const caller = await authenticate(req, admin);
  if (!caller || caller.kind !== 'user') return jsonResponse({ error: 'unauthorized' }, 401);
  if (caller.role !== 'campaign_manager') return jsonResponse({ error: 'forbidden' }, 403);
  if (!caller.companyId) return jsonResponse({ error: 'no active company' }, 400);
  const companyId = caller.companyId;
  const body = ((await req.json().catch(() => null)) ?? {}) as Body;
  const url = body.url?.trim();
  if (!url || socialHost(url) === null) return jsonResponse({ error: 'Paste a TikTok or Instagram link.' }, 400);

  let state;
  try {
    state = await getAnalysisState(admin, companyId, url);
  } catch (e) {
    console.error('reference-analyze read failed:', e instanceof Error ? e.message : e);
    return jsonResponse({ error: 'Could not load this reference. Try again.' }, 500);
  }

  if (state.status === 'pending') {
    const startedAt = state.started_at ? Date.parse(state.started_at) : 0;
    if (Date.now() - startedAt < STALE_RUN_MS) return jsonResponse({ status: 'pending', phase: state.phase }, 202);
  } else if (!body.force) {
    if (state.status === 'done') return jsonResponse({ status: 'done', analysis: state.analysis });
    if (state.status === 'failed') return jsonResponse({ status: 'failed', reason: state.reason });
  }

  try {
    await markAnalysisPending(admin, companyId, url);
  } catch (e) {
    console.error('reference-analyze start failed:', e instanceof Error ? e.message : e);
    return jsonResponse({ error: 'Could not start the analysis. Try again.' }, 500);
  }
  EdgeRuntime.waitUntil(
    // The failure reason is stored on the row by analyzeReference; the next poll returns it.
    analyzeReference(admin, { companyId, url, force: true }).catch(() => undefined),
  );
  return jsonResponse({ status: 'pending', phase: 'reading' }, 202);
});
