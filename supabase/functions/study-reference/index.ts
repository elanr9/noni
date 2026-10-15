// Studies reference posts so the writer learns from them. Campaign managers.
// { library_item_id } studies one Library reference; { url } studies a link;
// the answer carries each study's id and status, and the Library polls the
// reference_studies row (status, phase) for its live steps;
// { backfill: true } studies every Library reference not studied yet;
// { distill: true } rebuilds the reference playbook now.
// Answers at once and does the work in the background: the scrape can take
// minutes and nothing in the app waits on it.

import {
  adminClient,
  authenticate,
  handleCors,
  jsonResponse,
} from '../_shared/wp8.ts';
import {
  loadStudy,
  markStudyPending,
  maybeDistillPlaybook,
  normalizeReferenceUrl,
  type ReferenceStudy,
  studyReference,
} from '../_shared/referenceStudy.ts';
import { socialHost } from '../_shared/scrapeSocial.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

type Body = {
  library_item_id?: string;
  url?: string;
  backfill?: boolean;
  distill?: boolean;
};

// Scrapes run in parallel inside one background task, which the platform
// cuts off after a few minutes; larger libraries backfill over several calls.
const BACKFILL_LIMIT = 6;

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  const admin = adminClient();
  const caller = await authenticate(req, admin);
  if (!caller || caller.kind !== 'user') return jsonResponse({ error: 'unauthorized' }, 401);
  if (caller.role !== 'campaign_manager') return jsonResponse({ error: 'forbidden' }, 403);
  const companyId = caller.companyId;
  const body = ((await req.json().catch(() => null)) ?? {}) as Body;

  const targets: Array<{ url: string; libraryItemId: string | null }> = [];
  if (body.library_item_id) {
    const { data } = await admin
      .from('library_items')
      .select('id, url')
      .eq('id', body.library_item_id)
      .eq('company_id', companyId)
      .eq('source', 'reference')
      .maybeSingle();
    if (!data?.url) return jsonResponse({ error: 'unknown reference' }, 404);
    targets.push({ url: data.url, libraryItemId: data.id });
  } else if (body.url) {
    targets.push({ url: body.url.trim(), libraryItemId: null });
  } else if (body.backfill) {
    const [{ data: refs }, { data: studied }] = await Promise.all([
      admin
        .from('library_items')
        .select('id, url')
        .eq('company_id', companyId)
        .eq('source', 'reference')
        .not('url', 'is', null)
        .order('created_at', { ascending: false }),
      admin
        .from('reference_studies')
        .select('url')
        .eq('company_id', companyId)
        .eq('status', 'done'),
    ]);
    const done = new Set((studied ?? []).map((s) => s.url as string));
    for (const r of refs ?? []) {
      if (targets.length >= BACKFILL_LIMIT) break;
      if (!done.has(normalizeReferenceUrl(r.url as string))) {
        targets.push({ url: r.url as string, libraryItemId: r.id as string });
      }
    }
  } else if (!body.distill) {
    return jsonResponse({ error: 'expected library_item_id, url, backfill or distill' }, 400);
  }

  const readable = targets.filter((t) => socialHost(t.url) !== null);
  if (body.url && readable.length === 0) return jsonResponse({ error: 'Paste a TikTok or Instagram link.' }, 400);

  // A study that is not done yet reads pending from now on, so a caller
  // polling the row (the Library's live steps) never reads an old failure as
  // the new result. Studies already done are not run again.
  await Promise.all(
    readable.map(async (t) => {
      const existing = await loadStudy(admin, companyId, t.url);
      if (existing?.status === 'done' && existing.pattern) return;
      await markStudyPending(admin, companyId, t.url, t.libraryItemId).catch((e) =>
        console.warn('study-reference mark pending failed:', e instanceof Error ? e.message : e),
      );
    }),
  );

  EdgeRuntime.waitUntil(
    (async () => {
      const results = await Promise.all(
        readable.map((t) =>
          studyReference(admin, companyId, t.url, { libraryItemId: t.libraryItemId }).catch(
            (e): null => {
              console.error('study-reference failed:', t.url, e instanceof Error ? e.message : e);
              return null;
            },
          ),
        ),
      );
      const landed = results.some((s) => s?.status === 'done');
      if (!landed && !body.distill) return;
      try {
        await maybeDistillPlaybook(admin, companyId, Boolean(body.distill));
      } catch (e) {
        console.error('playbook distill failed:', e instanceof Error ? e.message : e);
      }
    })(),
  );

  const studies = await Promise.all(
    readable.map(async (t) => {
      const existing = await loadStudy(admin, companyId, t.url);
      return studySummary(t.url, existing);
    }),
  );

  return jsonResponse(
    { queued: readable.length, distill: Boolean(body.distill), studies },
    202,
  );
});

function studySummary(
  url: string,
  study: ReferenceStudy | null,
): { id: string | null; url: string; status: ReferenceStudy['status']; error: string | null } {
  return {
    id: study?.id ?? null,
    url: normalizeReferenceUrl(url),
    status: study?.status ?? 'pending',
    error: study?.status === 'failed' ? study.error : null,
  };
}
