// Builds or extends the caller's company brain from a website, app store
// links, pasted text and uploaded documents. Changes need a company admin or
// the manage_brand permission; any campaign manager may read the status.
//
// POST { action: 'start', website?: string, app_store_urls?: string[],
//        texts?: [{ title?: string, text: string }],
//        documents?: [{ bucket: 'brain-uploads', path: string, title?: string }],
//        import_legacy?: boolean }          (import_legacy defaults to true)
// POST { action: 'status' }
//   Both answer at once with
//   { ingest: { status: 'idle'|'running'|'done'|'failed', phase: 'crawl'|'extract'|'embed'|'suggest'|'done',
//               progress: { done: string[], failed: [{ input, error }], notes: string[] },
//               error, started_at, finished_at, updated_at } | null,
//     summary: { sources, sources_pending, facts, facts_confirmed, conflicts_open, coverage, missing: string[] },
//     started: boolean }
//   'start' answers 202. Poll 'status' every few seconds until status is done
//   or failed.
//
// How it survives the platform's limits. An edge function request is cut off
// at the wall clock (150 s on the free plan and 400 s on paid, by Supabase's
// published limits), and that applies
// to EdgeRuntime.waitUntil work too. One model call per source can take most
// of a minute, so a whole scan does not fit in one invocation. The run is
// therefore a row (brain_ingest) plus state that is already in the tables:
// a source with extracted_at null still needs extracting. Each invocation takes a short lease on
// the row, does steps until about 40 s have passed, releases the lease and,
// if work remains, calls itself for the next slice. If that hand-off is ever
// lost, the client's next 'status' poll finds a running row with no lease and
// picks the work up. Nothing is redone: every step is recorded as it lands.
//
// Embedding is not done here at all. The runtime's embedder burns the
// worker's own CPU and a worker over its CPU allowance is killed with nothing
// to catch, which used to end a run mid-scan and leave it "running" for good.
// The embed phase only asks brain-embed to start; that function works through
// the passages and records a few per request on its own workers, and the scan
// does not wait for it (search uses words until the vectors land).

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  addSource,
  type BrainSource,
  computeCoverage,
  EXTRACT_TIMEOUT_MS,
  extractFacts,
  importLegacyBrain,
  kickEmbed,
  suggestSurveyAnswers,
} from '../_shared/ai/brain.ts';
import type { BrainFact, SourceKind } from '../_shared/ai/contracts.ts';
import { brainCaller, text } from '../_shared/ai/brainHttp.ts';
import { assertSafePublicHttpUrl, crawlPages, stripHtml } from '../_shared/crawlSite.ts';
import { adminClient, handleCors, jsonResponse } from '../_shared/wp8.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

// A step is only started inside this window. The longest step is an
// extraction round (one model call per source, all at once, each cut off at
// EXTRACT_TIMEOUT_MS), so an invocation ends by about 140 s.
const START_BUDGET_MS = 40_000;
// Held a little longer than the longest invocation can live, so a slice that
// is still working is never joined by a second one.
const LEASE_MS = START_BUDGET_MS + EXTRACT_TIMEOUT_MS + 30_000;
const MAX_HOPS = 20;
// A site scan leaves about ten sources (pages, a store listing, reviews): read them in one round.
const EXTRACT_PARALLEL = 8;
const MAX_EXTRACT_ATTEMPTS = 2;
// A site with less text than this across all its pages drew itself in JavaScript; there is nothing to read.
const MIN_SITE_CHARS = 400;
const PART_CHARS = 20_000;
const MAX_TEXT_CHARS = 200_000;
const UPLOAD_BUCKET = 'brain-uploads';
const USER_AGENT = 'Mozilla/5.0 (compatible; NoniBot/1.0)';

type Inputs = {
  website?: string;
  app_store_urls?: string[];
  documents?: Array<{ bucket: string; path: string; title?: string }>;
  import_legacy?: boolean;
};
type Progress = { done: string[]; failed: Array<{ input: string; error: string }>; notes: string[] };
type IngestRow = {
  company_id: string;
  status: 'idle' | 'running' | 'done' | 'failed';
  phase: 'crawl' | 'embed' | 'extract' | 'suggest' | 'done';
  inputs: Inputs;
  progress: Partial<Progress>;
  error: string | null;
  lease_until: string | null;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
};

const progressOf = (row: IngestRow): Progress => ({
  done: row.progress?.done ?? [],
  failed: row.progress?.failed ?? [],
  notes: row.progress?.notes ?? [],
});

async function readRow(admin: SupabaseClient, companyId: string): Promise<IngestRow | null> {
  const { data } = await admin.from('brain_ingest').select('*').eq('company_id', companyId).maybeSingle();
  return (data as IngestRow | null) ?? null;
}

async function patchRow(admin: SupabaseClient, companyId: string, patch: Partial<IngestRow>): Promise<void> {
  await admin.from('brain_ingest').update({ ...patch, updated_at: new Date().toISOString() }).eq('company_id', companyId);
}

// ---------------------------------------------------------------- reading inputs

/** Long text is stored as several sources so each fits one extraction call. */
function parts(content: string): string[] {
  const out: string[] = [];
  let rest = content.slice(0, MAX_TEXT_CHARS).trim();
  while (rest.length > PART_CHARS) {
    // Break on a paragraph or sentence end so an excerpt is not cut in half.
    const window = rest.slice(0, PART_CHARS);
    const at = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('. ') + 1);
    const cut = at > PART_CHARS / 2 ? at : PART_CHARS;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

async function addText(
  admin: SupabaseClient,
  companyId: string,
  input: { kind: SourceKind; content: string; title?: string | null; url?: string | null; meta?: Record<string, unknown>; createdBy?: string | null },
): Promise<number> {
  const pieces = parts(input.content);
  let created = 0;
  for (const [i, content] of pieces.entries()) {
    const out = await addSource(admin, {
      companyId,
      kind: input.kind,
      content,
      url: input.url,
      title: pieces.length > 1 ? `${input.title ?? 'Document'} (part ${i + 1})` : input.title,
      meta: input.meta,
      createdBy: input.createdBy,
      deferEmbed: true,
    });
    if (out.created) created += 1;
  }
  return created;
}

/** Reads the site's best pages, one source per page, and returns what else it noticed. */
async function crawlWebsite(admin: SupabaseClient, companyId: string, inputs: Inputs): Promise<string[]> {
  const { pages, storeLinks } = await crawlPages(inputs.website!);
  const readable = pages.filter((page) => page.text.trim().length >= 80);
  if (readable.reduce((sum, page) => sum + page.text.length, 0) < MIN_SITE_CHARS) {
    throw new Error('The website has too little readable text. Paste a description of the product instead, or add an App Store link.');
  }
  const host = new URL(readable[0].url).hostname.replace(/^www\./, '');
  for (const page of readable) {
    await addText(admin, companyId, {
      kind: 'website_page',
      content: page.text,
      url: page.url,
      title: `${host}${page.path === '/' ? '' : page.path}`,
    });
  }
  const notes: string[] = [];
  // A store link on the home page is the company pointing at its own listing: read it when none was given.
  const store = storeLinks.find((link) => link.includes('apps.apple.com')) ?? storeLinks[0];
  if (store && !(inputs.app_store_urls ?? []).length) {
    await readStore(admin, companyId, store)
      .then(() => notes.push('Read the app store listing linked from your site'))
      .catch(() => undefined);
  }
  return notes;
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`store lookup ${res.status}`);
  return await res.json();
}

/**
 * An App Store link becomes two sources: the listing (the company's own
 * words, tier 3) and recent reviews (customers' words, tier 5). A Google
 * Play link is read as a page: listing only.
 */
async function readStore(admin: SupabaseClient, companyId: string, raw: string): Promise<void> {
  const url = assertSafePublicHttpUrl(raw);
  const apple = /(^|\.)apps\.apple\.com$/.test(url.hostname) ? /\/id(\d+)/.exec(url.pathname) : null;
  if (!apple) {
    const res = await fetch(url.href, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' });
    if (!res.ok) throw new Error(`store page ${res.status}`);
    assertSafePublicHttpUrl(res.url);
    const content = stripHtml(await res.text()).slice(0, 12_000);
    if (content.length < 80) throw new Error('The store page returned no readable text');
    await addText(admin, companyId, { kind: 'app_store', content, url: url.href, title: `Store listing (${url.hostname})` });
    return;
  }
  const id = apple[1];
  const country = /^\/([a-z]{2})\//.exec(url.pathname)?.[1] ?? 'us';
  const lookup = await fetchJson(`https://itunes.apple.com/lookup?id=${id}&country=${country}`);
  const app = (Array.isArray(lookup.results) ? lookup.results[0] : null) as Record<string, unknown> | null;
  if (!app) throw new Error('That app was not found on the App Store');
  const line = (label: string, v: unknown) => (v === undefined || v === null || v === '' ? '' : `${label}: ${Array.isArray(v) ? v.join(', ') : v}`);
  const listing = [
    line('App', app.trackName),
    line('Seller', app.sellerName),
    line('Category', app.genres),
    line('Price', app.formattedPrice),
    line('Rating', app.averageUserRating ? `${Number(app.averageUserRating).toFixed(1)} from ${app.userRatingCount} ratings` : ''),
    line('Age rating', app.contentAdvisoryRating),
    line('Description', app.description),
    line('Latest release notes', app.releaseNotes),
  ].filter(Boolean).join('\n');
  await addText(admin, companyId, {
    kind: 'app_store',
    content: listing,
    url: url.href,
    title: `App Store listing: ${app.trackName ?? id}`,
    meta: { store: 'apple', app_id: id, country },
  });

  const feed = await fetchJson(`https://itunes.apple.com/${country}/rss/customerreviews/page=1/id=${id}/sortby=mostrecent/json`).catch(() => null);
  const entries = ((feed?.feed as Record<string, unknown> | undefined)?.entry ?? []) as Array<Record<string, { label?: string }>>;
  const reviews = (Array.isArray(entries) ? entries : [])
    .filter((e) => e?.content?.label)
    .slice(0, 40)
    .map((e) => `Review, ${e['im:rating']?.label ?? '?'} stars. ${e.title?.label ?? ''}\n${e.content.label}`);
  if (reviews.length) {
    await addText(admin, companyId, {
      kind: 'review',
      content: reviews.join('\n\n'),
      url: url.href,
      title: `App Store reviews: ${app.trackName ?? id}`,
      meta: { store: 'apple', app_id: id, country, reviews: reviews.length },
    });
  }
}

/** Reads a text document the company uploaded under its own folder of the brain-uploads bucket. */
async function readDocument(admin: SupabaseClient, companyId: string, doc: { bucket: string; path: string; title?: string }): Promise<void> {
  if (doc.bucket !== UPLOAD_BUCKET) throw new Error('Documents must be in the brain-uploads bucket');
  if (!doc.path.startsWith(`${companyId}/`) || doc.path.includes('..')) throw new Error('That document belongs to another company');
  const extension = doc.path.split('.').pop()?.toLowerCase() ?? '';
  if (!['txt', 'md', 'markdown', 'csv', 'json', 'html', 'htm'].includes(extension)) {
    throw new Error('Only text files (txt, md, csv, json, html) can be read for now');
  }
  const { data, error } = await admin.storage.from(doc.bucket).download(doc.path);
  if (error || !data) throw new Error(error?.message ?? 'The document could not be downloaded');
  const raw = await data.text();
  const content = extension.startsWith('htm') ? stripHtml(raw) : raw;
  if (!content.trim()) throw new Error('The document is empty');
  await addText(admin, companyId, {
    kind: 'upload',
    content,
    title: doc.title || doc.path.split('/').pop() || 'Uploaded document',
    meta: { bucket: doc.bucket, path: doc.path },
  });
}

// ---------------------------------------------------------------- the run

function crawlItems(inputs: Inputs): string[] {
  return [
    ...(inputs.import_legacy === false ? [] : ['legacy']),
    ...(inputs.website ? [`website:${inputs.website}`] : []),
    ...(inputs.app_store_urls ?? []).map((u) => `store:${u}`),
    ...(inputs.documents ?? []).map((d) => `doc:${d.bucket}/${d.path}`),
  ];
}

/** Does one step and returns false when the run has nothing more to do. */
async function step(admin: SupabaseClient, row: IngestRow): Promise<boolean> {
  const companyId = row.company_id;
  const progress = progressOf(row);

  if (row.phase === 'crawl') {
    const item = crawlItems(row.inputs).find((i) => !progress.done.includes(i));
    if (!item) {
      await patchRow(admin, companyId, { phase: 'extract' });
      return true;
    }
    try {
      if (item === 'legacy') {
        const out = await importLegacyBrain(admin, companyId);
        if (out.sources || out.facts) progress.notes.push(`Imported ${out.sources} existing documents and ${out.facts} records`);
      } else if (item.startsWith('website:')) progress.notes.push(...(await crawlWebsite(admin, companyId, row.inputs)));
      else if (item.startsWith('store:')) await readStore(admin, companyId, item.slice('store:'.length));
      else {
        const doc = (row.inputs.documents ?? []).find((d) => `doc:${d.bucket}/${d.path}` === item);
        if (doc) await readDocument(admin, companyId, doc);
      }
    } catch (err) {
      // One unreadable input does not stop the rest; the client shows which.
      progress.failed.push({ input: item, error: err instanceof Error ? err.message : 'could not be read' });
    }
    progress.done.push(item);
    await patchRow(admin, companyId, { progress });
    return true;
  }

  if (row.phase === 'extract') {
    const { data: pending } = await admin
      .from('brain_sources')
      .select('*')
      .eq('company_id', companyId)
      .is('extracted_at', null)
      .order('authority_tier')
      .order('captured_at')
      .limit(EXTRACT_PARALLEL);
    const sources = (pending ?? []) as BrainSource[];
    if (!sources.length) {
      // Sources were read but none could be turned into records, and the brain is still empty:
      // say so plainly instead of finishing a scan that found nothing.
      const failedExtracts = progress.failed.filter((f) => f.input.startsWith('extract:'));
      if (failedExtracts.length) {
        const { count } = await admin.from('brain_facts').select('id', { count: 'exact', head: true }).eq('company_id', companyId);
        if (!count) {
          await patchRow(admin, companyId, {
            status: 'failed',
            error: 'We read your pages but could not pull facts from them. Scan again in a minute.',
            finished_at: new Date().toISOString(),
          });
          return false;
        }
      }
      await patchRow(admin, companyId, { phase: 'embed' });
      return true;
    }
    const outcomes = await Promise.allSettled(sources.map((s) => extractFacts(admin, s)));
    for (const [i, outcome] of outcomes.entries()) {
      if (outcome.status === 'fulfilled') continue;
      const source = sources[i];
      const attempts = Number(source.meta?.extract_attempts ?? 0) + 1;
      const error = outcome.reason as { message?: string; retryable?: boolean };
      // After two tries, or when trying again cannot help, the source is set aside so the run can finish.
      const giveUp = attempts >= MAX_EXTRACT_ATTEMPTS || error?.retryable === false;
      await admin
        .from('brain_sources')
        .update({
          meta: { ...source.meta, extract_attempts: attempts },
          extract_error: String(error?.message ?? 'extraction failed').slice(0, 500),
          ...(giveUp ? { extracted_at: new Date().toISOString() } : {}),
        })
        .eq('id', source.id);
      if (giveUp) progress.failed.push({ input: `extract:${source.title ?? source.id}`, error: String(error?.message ?? 'extraction failed').slice(0, 200) });
    }
    await patchRow(admin, companyId, { progress });
    return true;
  }

  if (row.phase === 'embed') {
    // Vectors are a refinement made elsewhere (see the note at the top): start them and move on.
    await kickEmbed(companyId);
    await patchRow(admin, companyId, { phase: 'suggest' });
    return true;
  }

  if (row.phase === 'suggest') {
    await suggestSurveyAnswers(admin, companyId).catch((err) => {
      progress.notes.push(`No draft answers: ${err instanceof Error ? err.message : 'failed'}`);
    });
    await patchRow(admin, companyId, { phase: 'done', status: 'done', progress, finished_at: new Date().toISOString() });
  }
  return false;
}

/** Takes the lease if nobody holds it. */
async function claim(admin: SupabaseClient, companyId: string): Promise<boolean> {
  const now = new Date();
  const { data } = await admin
    .from('brain_ingest')
    .update({ lease_until: new Date(now.getTime() + LEASE_MS).toISOString(), updated_at: now.toISOString() })
    .eq('company_id', companyId)
    .eq('status', 'running')
    .or(`lease_until.is.null,lease_until.lt."${now.toISOString()}"`)
    .select('company_id');
  return !!data?.length;
}

async function work(admin: SupabaseClient, companyId: string, hop: number): Promise<void> {
  if (!(await claim(admin, companyId))) return;
  const started = Date.now();
  try {
    while (Date.now() - started < START_BUDGET_MS) {
      const row = await readRow(admin, companyId);
      if (!row || row.status !== 'running') break;
      if (!(await step(admin, row))) break;
    }
  } catch (err) {
    await patchRow(admin, companyId, {
      status: 'failed',
      error: err instanceof Error ? err.message.slice(0, 500) : 'ingest failed',
      finished_at: new Date().toISOString(),
    });
  }
  await patchRow(admin, companyId, { lease_until: null });

  const row = await readRow(admin, companyId);
  if (row?.status !== 'running' || hop >= MAX_HOPS) return;
  // Hand the rest to a fresh invocation with its own wall clock.
  await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/brain-ingest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'continue', company_id: companyId, hop: hop + 1 }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}

async function summary(admin: SupabaseClient, companyId: string): Promise<Record<string, unknown>> {
  const count = (table: string) => admin.from(table).select('id', { count: 'exact', head: true }).eq('company_id', companyId);
  const [sources, pending, conflicts, { data: factRows }] = await Promise.all([
    count('brain_sources'),
    count('brain_sources').is('extracted_at', null),
    count('brain_conflicts').is('resolved_at', null),
    admin
      .from('brain_facts')
      .select('id, entity_type, key, title, data, status, confidence, authority_tier, usage, freshness, sources, valid_until, recheck_after')
      .eq('company_id', companyId)
      .in('status', ['inferred', 'confirmed'])
      .limit(2000),
  ]);
  const facts = (factRows ?? []) as unknown as BrainFact[];
  return {
    sources: sources.count ?? 0,
    sources_pending: pending.count ?? 0,
    facts: facts.length,
    facts_confirmed: facts.filter((f) => f.status === 'confirmed').length,
    conflicts_open: conflicts.count ?? 0,
    ...computeCoverage(facts, new Date()),
  };
}

function publicRow(row: IngestRow | null): Record<string, unknown> | null {
  if (!row) return null;
  const { lease_until: _lease, inputs: _inputs, company_id: _company, ...rest } = row;
  return { ...rest, progress: progressOf(row) };
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  // The hand-off from a previous slice of the same run, signed with the service role key.
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  if (token && token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
    const body = ((await req.json().catch(() => null)) ?? {}) as { company_id?: string; hop?: number };
    if (!body.company_id) return jsonResponse({ error: 'company_id is required' }, 400);
    EdgeRuntime.waitUntil(work(adminClient(), body.company_id, typeof body.hop === 'number' ? body.hop : 0));
    return jsonResponse({ started: true }, 202);
  }

  const caller = await brainCaller(req);
  if (caller instanceof Response) return caller;
  const { admin, companyId, userId, body } = caller;
  const action = text(body.action) || 'status';
  let row = await readRow(admin, companyId);

  if (action === 'status') {
    // A running row nobody holds means a hand-off was lost: pick it up.
    const idle = row?.status === 'running' && (!row.lease_until || Date.parse(row.lease_until) < Date.now());
    if (idle) EdgeRuntime.waitUntil(work(admin, companyId, 0));
    return jsonResponse({ ingest: publicRow(row), summary: await summary(admin, companyId), started: false });
  }
  if (action !== 'start') return jsonResponse({ error: 'Unknown action' }, 400);
  if (!caller.canWrite) return jsonResponse({ error: 'forbidden' }, 403);

  const inputs: Inputs = { import_legacy: body.import_legacy !== false };
  try {
    const website = text(body.website);
    if (website) inputs.website = assertSafePublicHttpUrl(website).href;
    const stores = Array.isArray(body.app_store_urls) ? body.app_store_urls.map(text).filter(Boolean).slice(0, 4) : [];
    if (stores.length) inputs.app_store_urls = stores.map((u) => assertSafePublicHttpUrl(u).href);
  } catch {
    return jsonResponse({ error: 'One of those addresses does not look right' }, 400);
  }
  const documents = (Array.isArray(body.documents) ? body.documents : []) as Array<Record<string, unknown>>;
  inputs.documents = documents
    .map((d) => ({ bucket: text(d?.bucket) || UPLOAD_BUCKET, path: text(d?.path), title: text(d?.title) || undefined }))
    .filter((d) => d.path)
    .slice(0, 10);

  // Pasted text is stored now: it is small, and the run row should not carry it.
  const texts = (Array.isArray(body.texts) ? body.texts : []) as Array<Record<string, unknown>>;
  let pasted = 0;
  try {
    for (const t of texts.slice(0, 10)) {
      const content = text(t?.text);
      if (content) pasted += await addText(admin, companyId, { kind: 'upload', content, title: text(t?.title) || 'Pasted text', createdBy: userId, meta: { pasted: true } });
    }
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'The text could not be saved' }, 500);
  }

  if (inputs.website) {
    // Keep the company's website on record the first time one is given, as research-company does.
    const { data: company } = await admin.from('companies').select('website').eq('id', companyId).maybeSingle();
    if (company && !company.website) await admin.from('companies').update({ website: inputs.website }).eq('id', companyId);
  }

  // A source whose extraction was given up last time gets another go: the
  // page has not changed, so reading it again would not create a new source.
  const { data: gaveUp } = await admin
    .from('brain_sources')
    .select('id, meta')
    .eq('company_id', companyId)
    .not('extract_error', 'is', null);
  for (const source of (gaveUp ?? []) as Array<{ id: string; meta: Record<string, unknown> | null }>) {
    const { extract_attempts: _attempts, ...meta } = source.meta ?? {};
    await admin.from('brain_sources').update({ extracted_at: null, extract_error: null, meta }).eq('id', source.id);
  }

  // A new start adds to whatever ran before: inputs already read are not read
  // again unless they were asked for again, and extraction only ever touches
  // sources that have not been through it.
  const previous = row ? progressOf(row) : { done: [], failed: [], notes: [] };
  const asked = new Set(crawlItems(inputs).filter((i) => i !== 'legacy'));
  const now = new Date().toISOString();
  const { data: saved, error } = await admin
    .from('brain_ingest')
    .upsert({
      company_id: companyId,
      status: 'running',
      phase: 'crawl',
      inputs,
      progress: {
        done: previous.done.filter((i) => !asked.has(i)),
        failed: [],
        notes: pasted ? [`Saved ${pasted} pasted ${pasted === 1 ? 'text' : 'texts'}`] : [],
      },
      error: null,
      started_at: now,
      finished_at: null,
      updated_at: now,
    }, { onConflict: 'company_id' })
    .select('*')
    .single();
  if (error) return jsonResponse({ error: error.message }, 500);
  row = saved as IngestRow;

  EdgeRuntime.waitUntil(work(admin, companyId, 0));
  return jsonResponse({ ingest: publicRow(row), summary: await summary(admin, companyId), started: true }, 202);
});
