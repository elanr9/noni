// Pure brain logic: no network, no database. Named .spec.ts so `deno test` (which
// globs *.test.ts) leaves it to vitest. Runs under vitest (`npx vitest run
// supabase/functions/_shared/ai/brain.spec.ts` from the repo root).
import { describe, expect, it } from 'vitest';

import type { BrainFact, EntityType } from './contracts.ts';
import {
  approvedClaims,
  bannedPhrases,
  buildDraft,
  chunkText,
  computeCoverage,
  COVERAGE,
  demoMoments,
  excerptInSource,
  factKey,
  type FactDraft,
  humanPatch,
  isEmptyCore,
  materialDifference,
  planUpsert,
  renderConstraints,
  renderCore,
  renderFact,
  reviewOrder,
  type SourceLike,
} from './brainCore.ts';
import {
  allowedEntityTypes,
  computeConfidence,
  decideUsage,
  ENTITIES,
  ENTITY_TYPES,
  extractableFields,
  extractionSchema,
  freshnessFor,
  normaliseData,
  SURVEY_QUESTIONS,
} from './brainSchema.ts';

const NOW = new Date('2026-11-18T12:00:00Z');
const PAGE =
  'Plan your week in minutes. Try Tidy free for 7 days, then $9.99 per month.\n' +
  'Sync with Google Calendar so every task lands on your schedule.  Trusted by 40,000 freelancers.';

const source = (over: Partial<SourceLike> = {}): SourceLike => ({
  id: 'src-1',
  kind: 'website_page',
  authority_tier: 3,
  content: PAGE,
  captured_at: '2026-11-18T10:00:00Z',
  ...over,
});

const draft = (type: EntityType, excerpt: string, data: Record<string, unknown>, src = source(), human?: { userId: string | null }) =>
  buildDraft(type, { key: '', title: '', excerpt, data }, src, { now: NOW, extractedBy: 'model:test', human });

let seq = 0;
function stored(d: FactDraft, over: Partial<BrainFact> = {}): BrainFact {
  seq += 1;
  return {
    ...d,
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    company_id: 'co-1',
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...over,
  };
}

const trial = (terms: string, src = source(), excerpt = 'Try Tidy free for 7 days') => draft('offer', excerpt, { kind: 'trial', terms }, src)!;

describe('excerpt verification', () => {
  it('finds an excerpt despite case, spacing and typographic differences', () => {
    expect(excerptInSource('sync with google calendar so every task lands on your schedule. Trusted by', PAGE)).toBe(true);
    expect(excerptInSource('“Plan your week in minutes”', '"Plan your week in minutes"')).toBe(true);
  });

  it('accepts an excerpt that skips text with an ellipsis, in order only', () => {
    expect(excerptInSource('Try Tidy free for 7 days ... Trusted by 40,000 freelancers', PAGE)).toBe(true);
    expect(excerptInSource('Trusted by 40,000 freelancers ... Try Tidy free for 7 days', PAGE)).toBe(false);
  });

  it('rejects a paraphrase and an excerpt too short to prove anything', () => {
    expect(excerptInSource('Tidy offers a free 7 day trial', PAGE)).toBe(false);
    expect(excerptInSource('your week', PAGE)).toBe(false);
    expect(excerptInSource('', PAGE)).toBe(false);
  });

  it('downgrades a record whose excerpt is not in the source to tier 6, inferred, context only', () => {
    const made = draft('feature', 'Tidy syncs with every calendar app', { name: 'Calendar sync', description: 'Syncs with calendars' })!;
    expect(made.authority_tier).toBe(6);
    expect(made.status).toBe('inferred');
    expect(made.usage).toBe('context_only');
    expect(made.confidence).toBe(0.4);
    expect(made.sources[0].excerpt).toBe('');
    expect(made.last_verified_at).toBeNull();
  });

  it('keeps tier and usage when the excerpt is found', () => {
    const made = draft('feature', 'Sync with Google Calendar so every task lands on your schedule.', { name: 'Calendar sync', description: 'Puts tasks on your calendar' })!;
    expect(made).toMatchObject({ authority_tier: 3, status: 'inferred', usage: 'generation_ok', confidence: 0.8, key: 'calendar-sync' });
  });

  it('requires a quote to be word for word in the source, not just its excerpt', () => {
    const reviews = source({ kind: 'review', authority_tier: 5, content: 'Review, 5 stars. Finally\nI stopped missing invoices the week I started using it.' });
    const real = draft('quote', 'I stopped missing invoices the week I started using it.', { text: 'I stopped missing invoices the week I started using it.' }, reviews)!;
    const tidied = draft('quote', 'I stopped missing invoices the week I started using it.', { text: 'Tidy means I never miss an invoice.' }, reviews)!;
    expect(real.authority_tier).toBe(5);
    expect(tidied.authority_tier).toBe(6);
  });
});

describe('tier rules', () => {
  it('lets third-party sources yield only customer language records', () => {
    expect(allowedEntityTypes(5).sort()).toEqual(['alternative', 'objection', 'pain', 'persona', 'quote']);
    const reviews = source({ kind: 'review', authority_tier: 5, content: 'Honestly it is basically free for what you get out of it.' });
    expect(draft('offer', 'it is basically free', { kind: 'pricing', terms: 'Free' }, reviews)).toBeNull();
    expect(draft('claim', 'it is basically free', { wording: 'It is free' }, reviews)).toBeNull();
    expect(draft('feature', 'it is basically free', { name: 'Free', description: 'Free' }, reviews)).toBeNull();
    const pain = draft('pain', 'it is basically free for what you get', { statement: 'Other tools cost too much' }, reviews)!;
    expect(pain.usage).toBe('context_only');
  });

  it('lets tiers 1 to 3 yield product records and never extracts angles or learnings', () => {
    for (const tier of [1, 2, 3] as const) {
      const types = allowedEntityTypes(tier);
      expect(types).toEqual(expect.arrayContaining(['product', 'feature', 'claim', 'offer', 'proof', 'demo_moment']));
      expect(types).not.toContain('angle');
      expect(types).not.toContain('learning');
    }
  });

  it('keeps numbers, offers and claims out of model-written documents', () => {
    const types = allowedEntityTypes(6);
    expect(types).not.toContain('claim');
    expect(types).not.toContain('offer');
    expect(types).not.toContain('proof');
    const guess = draft('persona', 'Plan your week in minutes.', { label: 'Planners', situation: 'Busy week' }, source({ authority_tier: 6 }))!;
    expect(guess).toMatchObject({ authority_tier: 6, usage: 'context_only', confidence: 0.4 });
  });

  it('never clears a claim, proof or differentiator for creators on a source alone', () => {
    const claim = draft('claim', 'Plan your week in minutes.', { wording: 'Plan your week in minutes', status: 'approved' })!;
    const proof = draft('proof', 'Trusted by 40,000 freelancers.', { statement: 'Trusted by 40,000 freelancers', value: '40,000 freelancers' })!;
    expect(claim.usage).toBe('context_only');
    expect(proof.usage).toBe('context_only');
  });

  it('marks prices, trial terms and numbers volatile with a recheck a week out', () => {
    const offer = trial('Free for 7 days');
    expect(offer.freshness).toBe('volatile');
    expect(offer.recheck_after).toBe('2026-11-25T12:00:00.000Z');
    expect(freshnessFor('proof', { value: '40,000 users' })).toBe('volatile');
    expect(freshnessFor('proof', { statement: 'Featured by Apple', value: '' })).toBe('slow');
    expect(freshnessFor('claim', { wording: 'Saves 3 hours a week' })).toBe('volatile');
    expect(freshnessFor('feature', {})).toBe('moving');
  });

  it('confirms what a person verifiably said, and only that', () => {
    const answer = source({ id: 'src-a', kind: 'survey_answer', authority_tier: 1, content: 'They download the app and get 14 days free, no card needed.' });
    const said = draft('offer', 'get 14 days free, no card needed', { kind: 'trial', terms: '14 days free, no card needed' }, answer, { userId: 'user-1' })!;
    const embellished = draft('offer', 'They get a lifetime discount', { kind: 'promotion', terms: 'Lifetime discount' }, answer, { userId: 'user-1' })!;
    expect(said).toMatchObject({ status: 'confirmed', confidence: 1, authority_tier: 1, usage: 'generation_ok', confirmed_by: 'user-1' });
    expect(embellished).toMatchObject({ status: 'inferred', authority_tier: 6, usage: 'context_only', confirmed_by: null });
  });
});

describe('confidence', () => {
  const e = (over: object) => ({ confirmed: false, tier: 3 as const, verbatim: true, sourceCount: 1, ...over });
  it('follows the rule table and ignores anything a model might say', () => {
    expect(computeConfidence(e({ confirmed: true, tier: 6, verbatim: false }))).toBe(1);
    expect(computeConfidence(e({ tier: 1 }))).toBe(0.9);
    expect(computeConfidence(e({ tier: 2 }))).toBe(0.9);
    expect(computeConfidence(e({ tier: 3 }))).toBe(0.8);
    expect(computeConfidence(e({ tier: 5, sourceCount: 2 }))).toBe(0.7);
    expect(computeConfidence(e({ tier: 5 }))).toBe(0.5);
    expect(computeConfidence(e({ tier: 3, verbatim: false }))).toBe(0.4);
    expect(computeConfidence(e({ tier: 6 }))).toBe(0.4);
  });

  it('only lets a confirmed, approved claim be stated', () => {
    expect(decideUsage('claim', { status: 'approved' }, e({ tier: 1 }))).toBe('context_only');
    expect(decideUsage('claim', { status: 'approved' }, e({ confirmed: true, tier: 1 }))).toBe('generation_ok');
    expect(decideUsage('claim', { status: 'banned' }, e({ confirmed: true, tier: 1 }))).toBe('context_only');
  });
});

describe('contradictions', () => {
  it('tells rewording from disagreement', () => {
    expect(materialDifference('offer', { terms: '7-day free trial' }, { terms: 'Try it free for 7 days' })).toBeNull();
    expect(materialDifference('offer', { terms: 'Free trial' }, { terms: '7-day free trial' })).toBeNull();
    expect(materialDifference('offer', { terms: '$9.99 per month' }, { terms: '$9.99 per month or $59.99 per year' })).toBeNull();
    expect(materialDifference('offer', { terms: '7-day free trial' }, { terms: '3-day free trial' })).toMatchObject({ field: 'terms' });
    expect(materialDifference('feature', { gating: 'Pro plan' }, { gating: 'Free for everyone' })).toMatchObject({ field: 'gating' });
    expect(materialDifference('claim', { status: 'approved' }, { status: 'banned' })).toMatchObject({ field: 'status' });
    expect(materialDifference('claim', { status: 'needs_substantiation' }, { status: 'approved' })).toBeNull();
    // Soft text is never a contradiction.
    expect(materialDifference('product', { one_liner: 'A planner' }, { one_liner: 'A calendar for teams' })).toBeNull();
  });

  it('keys a scoped record by its scope, so two markets do not collide', () => {
    expect(factKey('offer', 'x', 'Price', { kind: 'pricing', market: '' })).toBe('pricing');
    expect(factKey('offer', 'x', 'Price', { kind: 'pricing', market: 'UK' })).toBe('pricing@uk');
    expect(factKey('company', 'acme-inc', 'Acme', {})).toBe('company');
    expect(factKey('feature', '', 'Calendar Sync!', {})).toBe('calendar-sync');
  });

  it('inserts when the key is free', () => {
    expect(planUpsert([], trial('Free for 7 days'), NOW)).toMatchObject({ action: 'insert' });
  });

  it('merges the same value from a second source and raises confidence by corroboration', () => {
    const reviews = (id: string) => source({ id, kind: 'review', authority_tier: 5, content: 'I kept forgetting to send invoices before this app.' });
    const pain = (id: string) => draft('pain', 'I kept forgetting to send invoices', { statement: 'Forgetting to send invoices' }, reviews(id))!;
    const plan = planUpsert([stored(pain('src-r1'))], pain('src-r2'), NOW);
    expect(plan.action).toBe('merge');
    expect(plan.update!.patch.confidence).toBe(0.7);
    expect(plan.update!.patch.sources).toHaveLength(2);
    expect(plan.insert).toBeUndefined();
  });

  it('lets the higher authority win, keeps the loser as disputed and holds both sides of an offer', () => {
    const site = stored(trial('Free for 7 days'));
    const store = trial('Free for 3 days', source({ id: 'src-2', kind: 'app_store', authority_tier: 3, content: 'Try Tidy free for 3 days.' }), 'Try Tidy free for 3 days');
    // Same tier: the newer source wins.
    const sameTier = planUpsert([site], store, NOW);
    expect(sameTier).toMatchObject({ action: 'conflict', conflict: { winner: 'incoming', field: 'terms' } });
    expect(sameTier.update).toEqual({ id: site.id, patch: { status: 'disputed', usage: 'context_only' } });
    expect(sameTier.insert).toMatchObject({ status: 'inferred', usage: 'context_only', supersedes: site.id });

    // Lower authority arriving later loses and is stored as disputed.
    const billing = stored(trial('Free for 7 days', source({ id: 'src-3', kind: 'codebase', authority_tier: 2 })));
    const lower = planUpsert([billing], store, NOW);
    expect(lower).toMatchObject({ action: 'conflict', conflict: { winner: 'existing' } });
    expect(lower.update).toEqual({ id: billing.id, patch: { usage: 'context_only' } });
    expect(lower.insert).toMatchObject({ status: 'disputed', usage: 'context_only' });
  });

  it('does not hold a feature in conflict away from generation, only claims, offers and proof', () => {
    const gated = (gating: string, id: string) =>
      draft('feature', 'Sync with Google Calendar so every task lands on your schedule.', { name: 'Calendar sync', description: 'Sync', gating }, source({ id }))!;
    const plan = planUpsert([stored(gated('Pro plan', 'src-1'))], gated('Free for everyone', 'src-2'), NOW);
    expect(plan.action).toBe('conflict');
    expect(plan.insert!.usage).toBe('generation_ok');
  });

  it('never lets a scan rewrite or outrank a confirmed record', () => {
    const answer = source({ id: 'src-a', kind: 'survey_answer', authority_tier: 1, content: 'You get 14 days free, no card needed.' });
    const confirmed = stored(draft('offer', 'You get 14 days free, no card needed.', { kind: 'trial', terms: '14 days free' }, answer, { userId: 'u1' })!);
    const agree = planUpsert([confirmed], trial('Free for 14 days', source({ content: 'Try Tidy free for 14 days' }), 'Try Tidy free for 14 days'), NOW);
    expect(agree.action).toBe('merge');
    expect(agree.update!.patch.data).toBeUndefined();
    expect(agree.update!.patch.status).toBeUndefined();

    const disagree = planUpsert([confirmed], trial('Free for 7 days'), NOW);
    expect(disagree).toMatchObject({ action: 'conflict', conflict: { winner: 'existing' } });
    expect(disagree.update!.patch).toEqual({ usage: 'context_only' });
  });

  it('lets a person supersede a scanned value without raising a conflict', () => {
    const scanned = stored(trial('Free for 7 days'));
    const answer = source({ id: 'src-a', kind: 'survey_answer', authority_tier: 1, content: 'The trial is 14 days free now.' });
    const said = draft('offer', 'The trial is 14 days free now.', { kind: 'trial', terms: '14 days free' }, answer, { userId: 'u1' })!;
    const plan = planUpsert([scanned], said, NOW);
    expect(plan.action).toBe('supersede');
    expect(plan.update).toEqual({ id: scanned.id, patch: { status: 'retired' } });
    expect(plan.insert).toMatchObject({ status: 'confirmed', supersedes: scanned.id });
    expect(plan.conflict).toBeUndefined();
  });

  it('does not bring back a value a person rejected, or one already in dispute', () => {
    const rejected = stored(trial('Free for 7 days'), { status: 'retired', usage: 'blocked' });
    expect(planUpsert([rejected], trial('7 days free'), NOW).action).toBe('ignore');
    const disputed = stored(trial('Free for 3 days'), { status: 'disputed' });
    const live = stored(trial('Free for 7 days'));
    expect(planUpsert([live, disputed], trial('3 days free'), NOW).action).toBe('ignore');
    // A different value for the same key is still let in.
    expect(planUpsert([rejected], trial('Free for 14 days'), NOW).action).toBe('insert');
  });

  it('keeps the hold on a record in dispute when another scan agrees with it', () => {
    const held = stored(trial('Free for 7 days'), { usage: 'context_only' });
    const plan = planUpsert([held], trial('7 days free', source({ id: 'src-9' })), NOW, { liveInOpenConflict: true });
    expect(plan.action).toBe('merge');
    expect(plan.update!.patch.usage).toBe('context_only');
  });

  it('makes a person\'s edit tier 1 and confirmed, and treats confirming a pending claim as approval', () => {
    const scanned = stored(trial('Free for 7 days'));
    expect(humanPatch(scanned, 'u1', NOW, { data: { terms: '14 days free' } })).toMatchObject({
      status: 'confirmed', authority_tier: 1, confidence: 1, usage: 'generation_ok', confirmed_by: 'u1', extracted_by: 'human',
      data: { kind: 'trial', terms: '14 days free' },
    });
    const claim = stored(draft('claim', 'Plan your week in minutes.', { wording: 'Plan your week in minutes', status: 'needs_substantiation' })!);
    expect(humanPatch(claim, 'u1', NOW)).toMatchObject({ usage: 'generation_ok', data: { status: 'approved' } });
    const banned = stored(draft('claim', 'Plan your week in minutes.', { wording: 'Doubles your income', status: 'banned' })!);
    expect(humanPatch(banned, 'u1', NOW)).toMatchObject({ usage: 'context_only', data: { status: 'banned' } });
  });
});

// A small brain: a confirmed core, sourced extras and one guess.
function brain(): BrainFact[] {
  const answer = (content: string) => source({ id: 'src-a', kind: 'survey_answer', authority_tier: 1, content });
  const said = (type: EntityType, text: string, data: Record<string, unknown>) =>
    stored(draft(type, text, data, answer(text), { userId: 'u1' })!);
  return [
    said('product', 'Tidy is a weekly planner for freelancers.', { name: 'Tidy', one_liner: 'A weekly planner for freelancers' }),
    said('demo_moment', 'Open the Week tab, tap Plan my week, and the calendar fills in.', {
      feature: 'Calendar sync', start_state: 'The empty Week tab', user_action: 'Tap Plan my week', end_state: 'The calendar fills in', seconds: 8, is_aha: true,
      must_not_show: ['client names'],
    }),
    said('persona', 'Freelance designers who just lost a client to a missed deadline.', { label: 'Freelance designers', situation: 'Just lost a client to a missed deadline' }),
    said('pain', 'They keep missing deadlines because work lives in five apps.', { statement: 'Deadlines slip because work lives in five apps', persona: 'Freelance designers' }),
    said('claim', 'You can say it plans your week in under a minute.', { wording: 'It plans your week in under a minute', status: 'approved', qualifier: 'once your calendar is connected' }),
    said('claim', 'Never say it guarantees more income.', { wording: 'It guarantees more income', status: 'banned', reason: 'not something we can promise' }),
    said('alternative', 'They would go back to Notion templates.', { name: 'Notion', type: 'direct', falls_short: 'Templates need upkeep' }),
    stored(trial('Free for 7 days')),
    stored(draft('feature', 'Sync with Google Calendar so every task lands on your schedule.', { name: 'Calendar sync', description: 'Puts every task on your calendar' })!, {
      data: { ...normaliseData('feature', { name: 'Calendar sync', description: 'Puts every task on your calendar' }), media_urls: ['https://cdn.example/sync.png'] },
    }),
    stored(draft('persona', 'not in the page at all', { label: 'Students', situation: 'Exam season' })!),
  ];
}

describe('rendering', () => {
  it('renders the same bytes whatever order the records arrive in', () => {
    const facts = brain();
    const shuffled = [...facts].reverse();
    expect(renderCore(shuffled, 'Tidy', NOW)).toBe(renderCore(facts, 'Tidy', NOW));
    expect(renderConstraints(shuffled, NOW)).toBe(renderConstraints(facts, NOW));
    expect(renderCore(facts, 'Tidy', NOW)).toBe(renderCore(facts, 'Tidy', new Date(NOW.getTime() + 60_000)));
  });

  it('writes labelled text with ids, marks unconfirmed records and leaves guesses out of core', () => {
    const facts = brain();
    const core = renderCore(facts, 'Tidy', NOW);
    const offer = facts.find((f) => f.entity_type === 'offer')!;
    const guess = facts.find((f) => f.title === 'Exam season' || f.data.label === 'Students')!;
    expect(core).toContain(`- [${offer.id}] `);
    expect(core).toContain('Free for 7 days');
    expect(core).toMatch(new RegExp(`\\[${offer.id}\\].*\\(unconfirmed\\)`));
    expect(core).not.toContain(guess.id);
    expect(core).not.toContain('{');
    expect(core).not.toContain('https://cdn.example');
    const product = facts.find((f) => f.entity_type === 'product')!;
    expect(renderFact(product)).not.toContain('unconfirmed');
  });

  it('flags a volatile record that was not re-checked in time', () => {
    const offer = brain().find((f) => f.entity_type === 'offer')!;
    const later = new Date('2026-12-20T00:00:00Z');
    expect(renderFact(offer, later)).toContain('not re-checked recently');
    expect(renderFact(offer, NOW)).not.toContain('not re-checked recently');
  });

  it('always carries banned claims, required qualifiers, never-show and unnamed competitors', () => {
    const text = renderConstraints(brain(), NOW);
    expect(text).toContain('Never say');
    expect(text).toContain('"It guarantees more income": not something we can promise');
    expect(text).toContain('add: once your calendar is connected');
    expect(text).toContain('client names');
    expect(text).toContain('Do not name these competitors; describe the old way instead: Notion');
  });

  it('lists the banned claim wordings as phrases code can match, in a stable order', () => {
    const facts = brain();
    const phrases = bannedPhrases(facts, NOW);
    expect(phrases).toContain('it guarantees more income');
    expect(bannedPhrases([...facts].reverse(), NOW)).toEqual(phrases);
    expect(bannedPhrases([], NOW)).toEqual([]);
  });

  it('recognises the core of an empty brain', () => {
    expect(isEmptyCore(renderCore([], 'Tidy', NOW))).toBe(true);
    expect(isEmptyCore(renderCore(brain(), 'Tidy', NOW))).toBe(false);
  });

  it('returns approved claims and demo moments with ids, the demo with its feature media', () => {
    const facts = brain();
    const claims = approvedClaims(facts, NOW);
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({ wording: 'It plans your week in under a minute', qualifier: 'once your calendar is connected' });
    expect(facts.some((f) => f.id === claims[0].id)).toBe(true);
    const demos = demoMoments(facts, NOW);
    expect(demos).toHaveLength(1);
    expect(demos[0]).toMatchObject({ user_action: 'Tap Plan my week', seconds: 8, media_url: 'https://cdn.example/sync.png' });
  });

  it('drops an approved claim once its number is overdue for a recheck', () => {
    const facts = brain().map((f) =>
      f.entity_type === 'claim' && f.data.status === 'approved' ? { ...f, freshness: 'volatile' as const, recheck_after: '2026-11-01T00:00:00Z' } : f
    );
    expect(approvedClaims(facts, NOW)).toHaveLength(0);
  });
});

describe('coverage', () => {
  it('has weights that sum to 1, with the aha moment, persona, offer and claims heaviest', () => {
    expect(COVERAGE.reduce((sum, c) => sum + c.weight, 0)).toBeCloseTo(1, 10);
    expect(COVERAGE.slice(0, 5).map((c) => c.key)).toEqual(['aha_moment', 'persona_pain', 'offer', 'approved_claims', 'differentiator']);
  });

  it('is zero for an empty brain and lists everything as missing', () => {
    const { coverage, missing } = computeCoverage([], NOW);
    expect(coverage).toBe(0);
    expect(missing).toHaveLength(COVERAGE.length);
    expect(missing[0]).toContain('aha moment');
  });

  it('gives full weight to confirmed records, half to sourced ones and nothing to guesses', () => {
    const { coverage, missing } = computeCoverage(brain(), NOW);
    // aha .18 + persona and pain .16 + claims .14 + basics .08 + alternative .05 + never say .03, plus half of offer .07
    expect(coverage).toBe(0.71);
    expect(missing).toContain('The offer was read from a source but nobody has confirmed the terms.');
    expect(missing).toContain('What only this product can say.');
    expect(missing.some((m) => m.includes('aha moment'))).toBe(false);
  });

  it('does not count a guess, a blocked record or an expired one', () => {
    const guess = stored(draft('differentiator', 'not in the page', { attribute: 'Fastest planner' })!);
    const blocked = stored(trial('Free for 7 days'), { usage: 'blocked' });
    const expired = stored(trial('Free for 7 days'), { status: 'confirmed', valid_until: '2026-01-01T00:00:00Z' });
    expect(computeCoverage([guess, blocked, expired], NOW).coverage).toBe(0);
  });
});

describe('review order', () => {
  it('puts conflicting and uncertain records first and confirmed ones last', () => {
    const facts = brain();
    const offer = facts.find((f) => f.entity_type === 'offer')!;
    const ordered = reviewOrder(facts, new Set([offer.id]), NOW);
    expect(ordered[0].id).toBe(offer.id);
    expect(ordered[1].confidence).toBe(0.4);
    expect(ordered[ordered.length - 1].status).toBe('confirmed');
  });
});

describe('schema', () => {
  it('builds a strict extraction schema for exactly the types a tier may yield', () => {
    const strict = (node: unknown, path: string): void => {
      if (!node || typeof node !== 'object') return;
      const n = node as Record<string, unknown>;
      if (n.type === 'object') {
        expect(n.additionalProperties, path).toBe(false);
        expect([...(n.required as string[])].sort(), path).toEqual(Object.keys(n.properties as object).sort());
        for (const [k, v] of Object.entries(n.properties as object)) strict(v, `${path}.${k}`);
      }
      if (n.items) strict(n.items, `${path}[]`);
    };
    const schema = extractionSchema(allowedEntityTypes(5));
    strict(schema, '$');
    expect(Object.keys(schema.properties as object).sort()).toEqual(['alternative', 'objection', 'pain', 'persona', 'quote']);
    strict(extractionSchema(allowedEntityTypes(3)), '$');
    // No nullable fields: structured outputs cap how many a schema may have.
    expect(JSON.stringify(extractionSchema(allowedEntityTypes(3)))).not.toContain('null');
  });

  it('never asks the extractor for media and gives every entity a lead field', () => {
    expect(extractableFields('feature')).not.toContain('media_urls');
    expect(extractableFields('demo_moment')).not.toContain('media_url');
    for (const type of ENTITY_TYPES) expect(Object.keys(ENTITIES[type].fields)).toContain(ENTITIES[type].lead);
  });

  it('normalises data to the entity shape with safe defaults', () => {
    expect(normaliseData('claim', { wording: ' Fast ', status: 'verified', extra: 1 })).toEqual({
      wording: 'Fast', type: 'other', status: 'needs_substantiation', qualifier: '', reason: '', substantiation: '', market: '',
    });
    expect(normaliseData('demo_moment', { seconds: -3, is_aha: 'yes', must_not_show: ['a', '', 4] })).toMatchObject({ seconds: 0, is_aha: false, must_not_show: ['a'] });
  });

  it('chunks long text into overlapping passages', () => {
    const words = Array.from({ length: 500 }, (_, i) => `w${i}`).join(' ');
    const chunks = chunkText(words);
    expect(chunks).toHaveLength(3);
    expect(chunks[0].split(' ')).toHaveLength(240);
    expect(chunks[1].startsWith('w200 ')).toBe(true);
    expect(chunks[2].endsWith('w499')).toBe(true);
    expect(chunkText('  ')).toEqual([]);
  });

  it('asks ten required questions and one optional, in plain copy', () => {
    expect(SURVEY_QUESTIONS.filter((q) => !q.optional)).toHaveLength(10);
    expect(SURVEY_QUESTIONS.filter((q) => q.optional).map((q) => q.key)).toEqual(['payer_user']);
    for (const q of SURVEY_QUESTIONS) {
      for (const copy of [q.question, q.hint, q.why]) {
        expect(copy).not.toMatch(/[–—!]/);
        expect(copy).not.toMatch(/\p{Extended_Pictographic}/u);
        expect(copy).not.toMatch(/\b(amazing|awesome|supercharge|unlock|game.changing|revolutionary|seamless|effortless)\b/i);
        // Sentence case: no word after the first is capitalised unless it is a proper noun we expect.
        expect(copy.split(/[.?] /).every((s) => !/^[a-z]/.test(s))).toBe(true);
      }
    }
  });
});
