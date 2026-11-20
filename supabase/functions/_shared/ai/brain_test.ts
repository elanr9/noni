// The brain library end to end against an in-memory stand-in for the
// database, a scripted model and a fake embedder. No network.
//   cd supabase/functions && DENO_NO_PACKAGE_JSON=1 deno test --allow-env _shared/ai/
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  addSource,
  assembleBrainContext,
  type BrainDeps,
  type BrainSource,
  confirmFact,
  embedPending,
  extractFacts,
  importLegacyBrain,
  queueQuestion,
  recordSurveyAnswer,
  rejectFact,
  resolveConflict,
  suggestSurveyAnswers,
} from './brain.ts';
import type { BrainFact, ReferenceAnalysis } from './contracts.ts';
import { analyzeVoiceReferences, parseVoiceReferences } from './voiceReferences.ts';
import { assertStrictSchema } from './llm.ts';
import { allowedEntityTypes, extractionGuide, extractionSchema, recordData } from './brainSchema.ts';

// ---------------------------------------------------------------- fake database

type Row = Record<string, unknown>;
const LIVE = ['inferred', 'confirmed', 'stale'];

class FakeDb {
  tables: Record<string, Row[]> = {};
  rows(table: string): Row[] {
    return (this.tables[table] ??= []);
  }
  /** The constraints the migration declares that the library's ordering depends on. */
  check(table: string): { code: string; message: string } | null {
    const rows = this.rows(table);
    const dup = (key: (r: Row) => string | null) => {
      const seen = new Set<string>();
      for (const r of rows) {
        const k = key(r);
        if (k === null) continue;
        if (seen.has(k)) return true;
        seen.add(k);
      }
      return false;
    };
    const clash =
      (table === 'brain_facts' && dup((r) => (LIVE.includes(r.status as string) ? `${r.company_id}|${r.entity_type}|${r.key}` : null))) ||
      (table === 'brain_sources' && dup((r) => `${r.company_id}|${r.content_hash}`)) ||
      (table === 'brain_questions' && dup((r) => (r.status === 'open' ? `${r.company_id}|${String(r.question).trim().toLowerCase()}` : null)));
    return clash ? { code: '23505', message: `duplicate key in ${table}` } : null;
  }
  from(table: string): Query {
    return new Query(this, table);
  }
  rpc(name: string, args: Row): Promise<{ data: Row[]; error: null }> {
    assertEquals(name, 'match_brain');
    const words = String(args.p_query).toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    const data = this.rows('brain_facts')
      .filter((f) => f.company_id === args.p_company && ['inferred', 'confirmed'].includes(f.status as string) && f.usage !== 'blocked')
      .filter((f) => (args.p_types as string[]).includes(f.entity_type as string))
      .filter((f) => words.some((w) => `${f.title} ${f.search_text}`.toLowerCase().includes(w)))
      .slice(0, args.p_limit as number);
    return Promise.resolve({ data, error: null });
  }
  storage = { from: () => ({ getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }) }) };
}

class Query implements PromiseLike<{ data: unknown; error: unknown; count?: number }> {
  private filters: Array<(r: Row) => boolean> = [];
  private op: 'select' | 'insert' | 'update' | 'upsert' = 'select';
  private payload: Row | Row[] = {};
  private one: 'single' | 'maybe' | null = null;
  private max = Infinity;
  constructor(private db: FakeDb, private table: string) {}
  select() { return this; }
  insert(payload: Row | Row[]) { this.op = 'insert'; this.payload = payload; return this; }
  update(payload: Row) { this.op = 'update'; this.payload = payload; return this; }
  upsert(payload: Row) { this.op = 'upsert'; this.payload = payload; return this; }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
  neq(c: string, v: unknown) { this.filters.push((r) => r[c] !== v); return this; }
  in(c: string, v: unknown[]) { this.filters.push((r) => v.includes(r[c])); return this; }
  is(c: string, _v: null) { this.filters.push((r) => r[c] === null || r[c] === undefined); return this; }
  overlaps(c: string, v: unknown[]) { this.filters.push((r) => (r[c] as unknown[]).some((x) => v.includes(x))); return this; }
  contains(c: string, v: unknown[]) {
    this.filters.push((r) =>
      v.every((want) =>
        (r[c] as unknown[]).some((have) =>
          typeof want === 'object' && want !== null
            ? Object.entries(want).every(([k, x]) => (have as Row)[k] === x)
            : have === want
        )
      )
    );
    return this;
  }
  order() { return this; }
  limit(n: number) { this.max = n; return this; }
  single() { this.one = 'single'; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }

  private run(): { data: unknown; error: unknown } {
    const rows = this.db.rows(this.table);
    let out: Row[];
    if (this.op === 'insert' || this.op === 'upsert') {
      const incoming = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((r) => structuredClone(r));
      const before = rows.map((r) => ({ ...r }));
      out = incoming.map((r) => {
        const existing = this.op === 'upsert' ? rows.find((x) => x.company_id === r.company_id) : undefined;
        if (existing) return Object.assign(existing, r);
        const row = { id: crypto.randomUUID(), status: this.table === 'brain_questions' ? 'open' : undefined, embedding: null, ...r };
        rows.push(row);
        return row;
      });
      const error = this.db.check(this.table);
      if (error) {
        this.db.tables[this.table] = before;
        return { data: null, error };
      }
    } else if (this.op === 'update') {
      out = rows.filter((r) => this.filters.every((f) => f(r)));
      const before = rows.map((r) => ({ ...r }));
      for (const r of out) Object.assign(r, structuredClone(this.payload));
      const error = this.db.check(this.table);
      if (error) {
        this.db.tables[this.table] = before;
        return { data: null, error };
      }
    } else {
      out = rows.filter((r) => this.filters.every((f) => f(r))).slice(0, this.max);
    }
    const copy = out.map((r) => structuredClone(r));
    if (this.one) {
      if (!copy.length && this.one === 'single') return { data: null, error: { message: 'no rows' } };
      return { data: copy[0] ?? null, error: null };
    }
    return { data: copy, error: null };
  }
  then<A, B>(ok?: (v: { data: unknown; error: unknown }) => A | PromiseLike<A>, bad?: (e: unknown) => B | PromiseLike<B>): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.run()).then(ok, bad);
  }
}

// ---------------------------------------------------------------- fixtures

const CO = 'company-1';
const USER = 'user-1';
const NOW = new Date('2026-11-18T12:00:00Z');
const SITE = 'Plan your week in minutes. Try Tidy free for 7 days, then $9.99 per month. Sync with Google Calendar so every task lands on your schedule.';
const STORE = 'Tidy is the weekly planner for freelancers. Start with a 3-day free trial. Sync with Google Calendar so every task lands on your schedule.';

type Call = { task: string; input: string; schema: Record<string, unknown> };

function setup(script: (call: Call) => unknown) {
  const db = new FakeDb();
  const calls: Call[] = [];
  const deps: BrainDeps = {
    now: () => NOW,
    embed: (texts) => Promise.resolve(texts.map(() => Array.from({ length: 384 }, () => 0.05))),
    generate: ((req: Call) => {
      calls.push(req);
      const scripted = script(req);
      if (scripted instanceof Error) return Promise.reject(scripted);
      const data = req.task === 'brain.extract' ? asRecords(scripted as ByType) : scripted;
      return Promise.resolve({ data, model: 'test-model', runId: 'run', usage: {} });
    }) as unknown as BrainDeps['generate'],
  };
  db.rows('companies').push({ id: CO, name: 'Tidy Inc', settings: { product_name: 'Tidy' } });
  return { db, admin: db as unknown as SupabaseClient, deps, calls };
}

type ByType = Record<string, Array<{ key: string; title: string; excerpt: string; data: Record<string, unknown> }>>;

/**
 * The scripts below write an extraction grouped by type with plain data,
 * which is easy to read. The extractor's real reply is a flat list of records
 * whose fields are name and values pairs (brainSchema.extractionSchema); this
 * turns the one into the other.
 */
function asRecords(byType: ByType): { records: unknown[] } {
  return {
    records: Object.entries(byType).flatMap(([type, items]) =>
      (Array.isArray(items) ? items : []).map((item) => ({
        type,
        key: item.key,
        title: item.title,
        excerpt: item.excerpt,
        fields: Object.entries(item.data).map(([name, value]) => ({
          name,
          values: Array.isArray(value) ? value.map(String) : [String(value)],
        })),
      }))
    ),
  };
}

/** The record types a call was offered. */
const offered = (call: Call): string[] =>
  ((call.schema.properties as { records: { items: { properties: { type: { enum: string[] } } } } }).records.items.properties.type.enum);
const empty = (types: string[]) => Object.fromEntries(types.map((t) => [t, []]));
const facts = (db: FakeDb) => db.rows('brain_facts') as unknown as BrainFact[];

const siteExtraction = (call: Call) => ({
  ...empty(offered(call)),
  feature: [
    { key: 'calendar-sync', title: 'Calendar sync', excerpt: 'Sync with Google Calendar so every task lands on your schedule.', data: { name: 'Calendar sync', description: 'Puts every task on your Google Calendar' } },
    { key: 'ai-coach', title: 'AI coach', excerpt: 'An AI coach reviews your week', data: { name: 'AI coach', description: 'Reviews your week' } },
  ],
  offer: [{ key: 'x', title: 'Free trial', excerpt: 'Try Tidy free for 7 days', data: { kind: 'trial', terms: 'Free for 7 days' } }],
});

async function scanSite(admin: SupabaseClient, deps: BrainDeps): Promise<BrainSource> {
  const { source } = await addSource(admin, { companyId: CO, kind: 'website_page', content: SITE, url: 'https://tidy.test/', title: 'tidy.test' }, deps);
  await extractFacts(admin, source, deps);
  return source;
}

// ---------------------------------------------------------------- tests

Deno.test('extraction schemas for every tier pass the structured output checks in llm.ts', () => {
  for (const tier of [1, 2, 3, 4, 5, 6] as const) assertStrictSchema(extractionSchema(allowedEntityTypes(tier)));
});

Deno.test('the extraction schema stays small however many record types there are', () => {
  // Structured outputs refuse a schema whose grammar is too large (it took the
  // scan down once). The schema must not grow with the types or their fields.
  const few = JSON.stringify(extractionSchema(allowedEntityTypes(5)));
  const many = JSON.stringify(extractionSchema(allowedEntityTypes(3)));
  assert(many.length < 2500, `extraction schema is ${many.length} characters`);
  assert(many.length - few.length < 300);
  assert(!many.includes('one_liner'), 'field names belong in the guide, not the schema');
  // The guide carries what the schema no longer does.
  const guide = extractionGuide(allowedEntityTypes(3));
  for (const expected of ['feature: use when', 'maturity (one of stable, beta, changing, unknown)', 'seconds (whole number)', 'is_aha (true or false)', 'platforms (list)']) {
    assertStringIncludes(guide, expected);
  }
  assert(!guide.includes('media_urls'));
  assert(!extractionGuide(allowedEntityTypes(5)).includes('offer: use when'));
});

Deno.test('recordData types the name and values pairs and ignores what it does not know', () => {
  assertEquals(
    recordData('demo_moment', [
      { name: 'user_action', values: ['Tap Sync'] },
      { name: 'seconds', values: ['about 12 seconds'] },
      { name: 'is_aha', values: ['True'] },
      { name: 'must_not_show', values: ['client names'] },
      { name: 'must_not_show', values: ['prices', ' '] },
      { name: 'media_url', values: ['https://x.test/a.png'] },
      { name: 'made_up', values: ['x'] },
      { name: 'feature', values: [] },
      'nonsense',
    ]),
    { user_action: 'Tap Sync', seconds: 12, is_aha: true, must_not_show: ['client names', 'prices'] },
  );
  assertEquals(recordData('feature', [{ name: 'maturity', values: ['Beta'] }]), { maturity: 'beta' });
  assertEquals(recordData('feature', null), {});
});

Deno.test('addSource stores a document once, chunks it and embeds the chunks', async () => {
  const { db, admin, deps } = setup(() => ({}));
  const first = await addSource(admin, { companyId: CO, kind: 'website_page', content: SITE }, deps);
  const again = await addSource(admin, { companyId: CO, kind: 'website_page', content: `${SITE}\r\n` }, deps);
  assertEquals(first.created, true);
  assertEquals(again.created, false);
  assertEquals(again.source.id, first.source.id);
  assertEquals(first.source.authority_tier, 3);
  assertEquals(db.rows('brain_chunks').length, 1);
  assert(typeof db.rows('brain_chunks')[0].embedding === 'string');
  assertEquals(await embedPending(admin, CO, {}, deps), 0);
});

Deno.test('extractFacts keeps what the source states and demotes what it does not', async () => {
  const { db, admin, deps, calls } = setup(siteExtraction);
  await scanSite(admin, deps);
  const byKey = Object.fromEntries(facts(db).map((f) => [`${f.entity_type}:${f.key}`, f]));
  assertEquals(byKey['feature:calendar-sync'].authority_tier, 3);
  assertEquals(byKey['feature:calendar-sync'].usage, 'generation_ok');
  assertEquals(byKey['feature:calendar-sync'].extracted_by, 'model:test-model');
  // The model invented this one: the excerpt is not on the page.
  assertEquals(byKey['feature:ai-coach'].authority_tier, 6);
  assertEquals(byKey['feature:ai-coach'].usage, 'context_only');
  assertEquals(byKey['feature:ai-coach'].sources[0].excerpt, '');
  assertEquals(byKey['offer:trial'].freshness, 'volatile');
  assert(db.rows('brain_sources')[0].extracted_at);
  // The document travels as data in the user turn, and the prompt names the kind of source.
  assertStringIncludes(calls[0].input, '<document>');
  assertStringIncludes(calls[0].input, "the company's own website");
});

Deno.test('a review source is never offered product record types', async () => {
  const { admin, deps, calls } = setup((call) => empty(offered(call)));
  const { source } = await addSource(admin, { companyId: CO, kind: 'review', content: 'Review, 5 stars. It is basically free for what you get.' }, deps);
  await extractFacts(admin, source, deps);
  assertEquals([...offered(calls[0])].sort(), ['alternative', 'objection', 'pain', 'persona', 'quote']);
});

Deno.test('two sources that disagree on the trial raise a conflict, and a person settles it', async () => {
  const { db, admin, deps } = setup((call) =>
    call.input.includes('3-day')
      ? { ...empty(offered(call)), offer: [{ key: 'x', title: 'Free trial', excerpt: 'Start with a 3-day free trial.', data: { kind: 'trial', terms: '3-day free trial' } }] }
      : siteExtraction(call)
  );
  await scanSite(admin, deps);
  const { source: store } = await addSource(admin, { companyId: CO, kind: 'app_store', content: STORE }, deps);
  const result = await extractFacts(admin, store, deps);
  assertEquals(result.conflicts, 1);

  const trials = facts(db).filter((f) => f.entity_type === 'offer');
  assertEquals(trials.map((f) => f.status).sort(), ['disputed', 'inferred']);
  // Neither side may be stated while the dispute is open.
  assertEquals(trials.map((f) => f.usage), ['context_only', 'context_only']);
  const [conflict] = db.rows('brain_conflicts');
  assertEquals(conflict.field, 'terms');
  assertEquals((conflict.fact_ids as string[]).length, 2);

  const open = await assembleBrainContext(admin, { companyId: CO }, deps);
  assertEquals(open.conflicts.length, 1);
  assertStringIncludes(open.conflicts[0], 'State neither');

  // The person says the website was right.
  const website = trials.find((f) => f.status === 'disputed')!;
  const kept = await resolveConflict(admin, CO, conflict.id as string, website.id, USER, deps);
  assertEquals(kept?.status, 'confirmed');
  assertEquals(kept?.authority_tier, 1);
  assertEquals(kept?.usage, 'generation_ok');
  assertEquals(facts(db).find((f) => f.id !== website.id && f.entity_type === 'offer')!.status, 'retired');
  assertEquals(db.rows('brain_conflicts')[0].resolution, `kept:${website.id}`);
  assertEquals((await assembleBrainContext(admin, { companyId: CO }, deps)).conflicts, []);

  // Scanning the store again does not reopen what was settled.
  db.rows('brain_sources').find((s) => s.id === store.id)!.extracted_at = null;
  const rescan = await extractFacts(admin, { ...store, extracted_at: null }, deps);
  assertEquals(rescan.conflicts, 0);
  assertEquals(db.rows('brain_conflicts').length, 1);
});

Deno.test('a rejected record stays rejected when the next scan finds it again', async () => {
  const { db, admin, deps } = setup(siteExtraction);
  const source = await scanSite(admin, deps);
  const feature = facts(db).find((f) => f.key === 'calendar-sync')!;
  const rejected = await rejectFact(admin, CO, feature.id, USER, deps);
  assertEquals([rejected.status, rejected.usage], ['retired', 'blocked']);
  const again = await extractFacts(admin, source, deps);
  assert(again.dropped >= 1);
  assertEquals(facts(db).filter((f) => f.key === 'calendar-sync').length, 1);
});

Deno.test('a survey answer is saved first, then becomes confirmed records', async () => {
  const answer = 'They download the app and get 14 days free, no card needed.';
  const { db, admin, deps } = setup((call) => ({
    ...empty(offered(call)),
    offer: [
      { key: 'x', title: 'Free trial', excerpt: 'get 14 days free, no card needed', data: { kind: 'trial', terms: '14 days free, no card needed' } },
      { key: 'y', title: 'Discount', excerpt: 'half price for life', data: { kind: 'promotion', terms: 'Half price for life' } },
    ],
  }));
  await scanSite(admin, { ...deps, generate: ((req: Call) => Promise.resolve({ data: asRecords(siteExtraction(req)), model: 'test-model' })) as unknown as BrainDeps['generate'] });
  const scanned = facts(db).find((f) => f.key === 'trial')!;

  const out = await recordSurveyAnswer(admin, CO, 'offer', answer, USER, deps);
  assertEquals(out.extractError, null);
  const trial = facts(db).find((f) => f.key === 'trial' && f.status === 'confirmed')!;
  assertEquals([trial.authority_tier, trial.confidence, trial.usage, trial.confirmed_by], [1, 1, 'generation_ok', USER]);
  // The person's word replaces the scanned value quietly: no conflict card.
  assertEquals(trial.supersedes, scanned.id);
  assertEquals(facts(db).find((f) => f.id === scanned.id)!.status, 'retired');
  assertEquals(db.rows('brain_conflicts').length, 0);
  // What the model added beyond the answer is a guess, not a confirmed offer.
  const invented = facts(db).find((f) => f.key === 'promotion')!;
  assertEquals([invented.status, invented.authority_tier, invented.usage], ['inferred', 6, 'context_only']);

  const saved = (db.rows('brain_survey')[0].answers as Record<string, { answer: string; fact_ids: string[] }>).offer;
  assertEquals(saved.answer, answer);
  assert(saved.fact_ids.includes(trial.id));
  assertEquals(db.rows('brain_sources').find((s) => s.kind === 'survey_answer')!.authority_tier, 1);
});

Deno.test('a failed model call still keeps the survey answer and leaves the source queued', async () => {
  const { db, admin, deps } = setup(() => new Error('Claude call timed out'));
  const out = await recordSurveyAnswer(admin, CO, 'only_we', 'We are the only planner that books the time for you.', USER, deps);
  assertEquals(out.facts, []);
  assertEquals(out.extractError, 'Claude call timed out');
  assertEquals((db.rows('brain_survey')[0].answers as Record<string, { answer: string }>).only_we.answer, 'We are the only planner that books the time for you.');
  assertEquals(db.rows('brain_sources')[0].extracted_at, null);
});

Deno.test('assembleBrainContext is byte-stable, marks unconfirmed records and reports what is missing', async () => {
  const { db, admin, deps } = setup(siteExtraction);
  await scanSite(admin, deps);
  const first = await assembleBrainContext(admin, { companyId: CO, topic: 'syncing tasks to a calendar' }, deps);
  db.rows('brain_facts').reverse();
  const second = await assembleBrainContext(admin, { companyId: CO, topic: 'a different topic entirely' }, deps);
  assertEquals(second.core, first.core);
  assertEquals(second.constraints, first.constraints);
  assertEquals(first.productName, 'Tidy');
  assertStringIncludes(first.core, '(unconfirmed)');
  // The invented feature is a guess: not in core, reachable only by search, and labelled.
  assert(!first.core.includes('AI coach'));
  assertEquals(first.approvedClaims, []);
  assert(first.coverage < 0.3);
  assert(first.missing.some((m) => m.includes('aha moment')));

  const feature = facts(db).find((f) => f.key === 'calendar-sync')!;
  const confirmed = await confirmFact(admin, CO, feature.id, USER, deps);
  assertEquals([confirmed.status, confirmed.authority_tier, confirmed.confidence], ['confirmed', 1, 1]);
});

Deno.test('importLegacyBrain carries approval over and keeps drafts as hypotheses', async () => {
  const { db, admin, deps, calls } = setup(() => ({}));
  db.rows('brand_docs').push(
    { company_id: CO, kind: 'product_truth', content: 'Tidy plans a freelancer week from their calendar.', human_edited: true },
    { company_id: CO, kind: 'voice', content: 'Warm, direct, a little dry.', human_edited: false },
  );
  db.rows('brand_profiles').push({ company_id: CO, tone: 'Friendly', audience: null, products: null, content_pillars: null, buying_path: null, banned_phrases: ['game changer', 'hustle'] });
  db.rows('product_features').push(
    { company_id: CO, name: 'Week view', what_it_does: 'Shows the whole week on one screen', claim: 'See your whole week on one screen', approved: true, rejected: false, clip_url: null, screenshot_url: 'https://cdn.test/week.png' },
    { company_id: CO, name: 'Auto invoice', what_it_does: 'Drafts invoices from tracked time', claim: 'Invoices write themselves', approved: false, rejected: false, clip_url: null, screenshot_url: null },
    { company_id: CO, name: 'Old thing', what_it_does: 'Was removed from the app', claim: 'Gone', approved: false, rejected: true, clip_url: null, screenshot_url: null },
  );
  db.rows('brain_features').push({ id: 'bf-1', company_id: CO, name: 'Focus timer', sentence: 'A timer that blocks your calendar while you work' });
  db.rows('feature_screenshots').push({ company_id: CO, feature_id: 'bf-1', path: 'co/focus.png', sort_order: 0 });
  db.rows('reference_studies').push({ company_id: CO, url: 'https://tiktok.test/v/1', platform: 'tiktok', format: 'talking head', caption: 'my sunday reset', transcript: 'Every sunday I sit down and plan the week.', pattern: { topic: 'Sunday reset', hook_type: 'routine', why_it_works: 'Opens on a ritual the viewer already has' }, status: 'done' });

  const result = await importLegacyBrain(admin, CO, deps);
  assertEquals(calls.length, 0);
  const all = facts(db);
  const get = (type: string, key: string) => all.find((f) => f.entity_type === type && f.key === key)!;

  const claim = get('claim', 'week-view');
  assertEquals([claim.status, claim.authority_tier, claim.usage, claim.data.status], ['confirmed', 1, 'generation_ok', 'approved']);
  assertEquals(get('feature', 'week-view').data.media_urls, ['https://cdn.test/week.png']);
  // A model's draft claim is not carried over; its feature is a hypothesis.
  assertEquals(all.filter((f) => f.entity_type === 'claim').length, 1);
  assertEquals([get('feature', 'auto-invoice').authority_tier, get('feature', 'auto-invoice').usage], [6, 'context_only']);
  assertEquals(all.some((f) => f.key === 'old-thing'), false);
  assertEquals(get('feature', 'focus-timer').status, 'confirmed');
  assertEquals(get('feature', 'focus-timer').data.media_urls, ['https://cdn.test/co/focus.png']);
  assertEquals(get('voice_rule', 'banned-phrases').data.banned_words, ['game changer', 'hustle']);
  const learning = all.find((f) => f.entity_type === 'learning')!;
  assertEquals([learning.authority_tier, learning.usage, learning.sources[0].excerpt], [6, 'context_only', '']);

  const sources = db.rows('brain_sources');
  assertEquals(sources.find((s) => s.title === 'Brand doc: product truth')!.authority_tier, 1);
  assertEquals(sources.find((s) => s.title === 'Brand doc: voice')!.authority_tier, 6);
  // Documents wait for extraction; a reference post is never extracted.
  assertEquals(sources.find((s) => s.title === 'Brand doc: voice')!.extracted_at, null);
  assert(sources.find((s) => s.kind === 'reference_post')!.extracted_at);
  assertEquals(result.pendingExtraction, 3);

  const context = await assembleBrainContext(admin, { companyId: CO }, deps);
  assertEquals(context.approvedClaims.map((c) => c.wording), ['See your whole week on one screen']);
  assertStringIncludes(context.constraints, 'Never use: game changer, hustle');
  assertEquals(context.bannedPhrases, ['game changer', 'hustle']);

  // Running it again adds nothing.
  const again = await importLegacyBrain(admin, CO, deps);
  assertEquals([again.sources, facts(db).length], [0, all.length]);
});

Deno.test('suggested answers cite records that exist and carry their sources', async () => {
  const { db, admin, deps } = setup((call) => {
    if (call.task === 'brain.extract') return siteExtraction(call);
    const trial = (db.rows('brain_facts') as unknown as BrainFact[]).find((f) => f.key === 'trial')!;
    return {
      suggestions: [
        { key: 'offer', answer: 'We ask viewers to start the 7 day free trial.', fact_ids: [trial.id] },
        { key: 'hesitation', answer: 'People think it is expensive.', fact_ids: ['not-a-real-id'] },
      ],
    };
  });
  await scanSite(admin, deps);
  const suggestions = await suggestSurveyAnswers(admin, CO, deps);
  assertEquals(Object.keys(suggestions), ['offer']);
  assertEquals(suggestions.offer.sources[0], { title: 'tidy.test', url: 'https://tidy.test/', kind: 'website_page', excerpt: 'Try Tidy free for 7 days' });
  assertEquals(Object.keys(db.rows('brain_survey')[0].suggestions as object), ['offer']);
});

Deno.test('queueQuestion stores the same open question once', async () => {
  const { db, admin } = setup(() => ({}));
  await queueQuestion(admin, { companyId: CO, question: 'Is there an Android app?', why: 'The brief shows a phone', askedBy: 'brief.write' });
  await queueQuestion(admin, { companyId: CO, question: 'is there an android app? ', askedBy: 'brief.plan' });
  assertEquals(db.rows('brain_questions').length, 1);
});

// ---------------------------------------------------------------- voice references

const VOICE_ANSWER = [
  'Love these:',
  'https://www.tiktok.com/@planner/video/111 the hook is one honest sentence',
  'instagram.com/reel/AbC123/',
  'She just talks, no music.',
  'https://www.tiktok.com/@other/video/333',
  '',
  'This one I hate, it shouts at me: https://www.tiktok.com/@loud/video/444',
].join('\n');

Deno.test('parseVoiceReferences reads each link, the note beside it and which way the founder leans', () => {
  const refs = parseVoiceReferences(VOICE_ANSWER);
  assertEquals(refs.map((r) => [r.url, r.stance, r.stanceFrom]), [
    ['https://www.tiktok.com/@planner/video/111', 'liked', 'words'],
    ['https://instagram.com/reel/AbC123/', 'liked', 'words'],
    ['https://www.tiktok.com/@other/video/333', 'liked', 'words'],
    ['https://www.tiktok.com/@loud/video/444', 'disliked', 'words'],
  ]);
  assertEquals(refs[0].note, 'the hook is one honest sentence');
  assertEquals(refs[1].note, 'She just talks, no music.');
  assertEquals(refs[3].note, 'This one I hate, it shouts at me');

  // Four bare links: the question asks for the hated one last.
  const bare = parseVoiceReferences(['tiktok.com/@a/video/1', 'tiktok.com/@a/video/2', 'tiktok.com/@a/video/3', 'tiktok.com/@a/video/4'].join('\n'));
  assertEquals(bare.map((r) => [r.stance, r.stanceFrom]), [['liked', 'default'], ['liked', 'default'], ['liked', 'default'], ['disliked', 'position']]);
  // Three bare links say nothing about a disliked one; links elsewhere are ignored.
  assertEquals(parseVoiceReferences('tiktok.com/@a/video/1 tiktok.com/@a/video/2 https://youtube.com/watch?v=1').map((r) => r.stance), ['liked', 'liked']);
  assertEquals(parseVoiceReferences('We like calm videos.'), []);
});

Deno.test('a voice answer with links becomes liked and disliked references the brain context returns', async () => {
  const { db, admin, deps } = setup((call) => empty(offered(call)));
  const answered = await recordSurveyAnswer(admin, CO, 'voice', VOICE_ANSWER, USER, deps);
  const analysis = (url: string): ReferenceAnalysis => ({
    version: 2, url, platform: 'tiktok', media: 'video', duration_ms: 20000, author: 'planner', caption: `caption for ${url}`, hashtags: [],
    metrics: { views: null, likes: null, comments: null, shares: null, saves: null }, posted_at: null, sound: { title: null, original: null },
    transcript: `Every sunday I plan the week. ${url}`, words: [], observed: { transcript: true, word_timings: false, frames: false },
    format: 'talking head', hook: { spoken: 'Every sunday I plan the week.', on_screen: null, visual: '', archetype: 'routine', ends_ms: 2000 },
    beats: [], on_screen_text: [], slides: [], editing: { cut_count: null, avg_shot_ms: null, captions: 'unknown', notes: '' },
    product_moment: { present: false, start_ms: null, how: '' }, cta: { kind: 'none', wording: null },
    why_it_works: ['It opens on a ritual the viewer already has.'], transfer: { keep: [], replace: [] },
  });
  const refs = parseVoiceReferences(VOICE_ANSWER);
  const out = await analyzeVoiceReferences(admin, CO, refs, { surveySourceId: answered.source.id, userId: USER }, {
    ...deps,
    analyze: (_a, args) => (args.url.includes('333') ? Promise.reject(new Error('private post')) : Promise.resolve(analysis(args.url))),
  });
  assertEquals([out.recorded, out.failed.map((f) => f.url)], [3, ['https://www.tiktok.com/@other/video/333']]);

  const learnings = facts(db).filter((f) => f.entity_type === 'learning');
  assertEquals(learnings.length, 3);
  const hated = learnings.find((f) => String(f.data.statement).startsWith('The founder would hate'))!;
  assertStringIncludes(String(hated.data.statement), 'Their words: "This one I hate, it shouts at me".');
  assertStringIncludes(String(hated.data.statement), 'Do not model a brief on it.');
  // The founder's words are cited from the survey answer; the reading of the post stays unconfirmed and is never stated.
  assertEquals([hated.status, hated.usage, hated.sources[0].source_id, hated.sources[0].excerpt], ['inferred', 'context_only', answered.source.id, 'This one I hate, it shouts at me']);
  const posts = db.rows('brain_sources').filter((s) => s.kind === 'reference_post');
  assertEquals(posts.map((s) => (s.meta as { stance: string }).stance).sort(), ['disliked', 'liked', 'liked']);
  assert(posts.every((s) => s.extracted_at));

  const context = await assembleBrainContext(admin, { companyId: CO }, deps);
  assertStringIncludes(context.retrieved, 'The founder wishes this post were theirs.');
  assertStringIncludes(context.retrieved, 'The founder would hate to post this.');

  // The same answer again adds nothing.
  await analyzeVoiceReferences(admin, CO, refs, { surveySourceId: answered.source.id, userId: USER }, { ...deps, analyze: (_a, args) => Promise.resolve(analysis(args.url)) });
  assertEquals(facts(db).filter((f) => f.entity_type === 'learning').length, 4);
});

