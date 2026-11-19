// The brain's decisions, with no database and no network: whether an excerpt
// really is in its source, what a source of a given tier may assert, what to
// do when two records disagree, how records are written out for a model, and
// how much the brain knows. brain.ts does the I/O around these.

import type {
  ApprovedClaim,
  AuthorityTier,
  BrainFact,
  DemoMomentRef,
  EntityType,
  FactSourceRef,
  SourceKind,
} from './contracts.ts';
import {
  allowedEntityTypes,
  computeConfidence,
  decideUsage,
  ENTITIES,
  type Evidence,
  freshnessFor,
  normaliseData,
  recheckAfter,
  statusFor,
} from './brainSchema.ts';

/** A record before it has an id: what upsertFact is given and what it writes. */
export type FactDraft = Omit<BrainFact, 'id' | 'company_id' | 'created_at' | 'updated_at'>;

export type SourceLike = {
  id: string;
  kind: SourceKind;
  authority_tier: AuthorityTier;
  content: string;
  captured_at?: string;
};

/** One record as the extractor returns it. */
export type ExtractedItem = { key: string; title: string; excerpt: string; data: unknown };

// ---------------------------------------------------------------- text

/** Folds the differences that copying text introduces: case, spacing, curly quotes, dash styles. */
export function normaliseText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * True when the excerpt occurs in the source. An excerpt may skip text with
 * an ellipsis; each piece must then occur, in order. Very short excerpts do
 * not count: three common words can be found in any document.
 */
export function excerptInSource(excerpt: string, content: string): boolean {
  const haystack = normaliseText(content);
  const needle = normaliseText(excerpt);
  if (!needle || !haystack) return false;
  const short = needle.replace(/\.\.\./g, ' ').split(' ').filter(Boolean).length < 3;
  if (short && haystack !== needle) return false;
  let from = 0;
  for (const part of needle.split('...').map((p) => p.trim()).filter(Boolean)) {
    const at = haystack.indexOf(part, from);
    if (at < 0) return false;
    from = at + part.length;
  }
  return true;
}

export function slugify(text: string): string {
  return normaliseText(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** What the record itself calls its subject, when it has such a field. */
function nameOf(data: Record<string, unknown>): string {
  for (const field of ['name', 'label', 'term']) {
    if (typeof data[field] === 'string' && data[field]) return data[field] as string;
  }
  return '';
}

/**
 * The key a record is matched on. Singletons get a fixed key, an offer is
 * keyed by which part of the offer it is, and a record limited to a market or
 * plan carries that in the key so that "$9.99" in the US and "£8.99" in the
 * UK are two records and not a contradiction.
 */
export function factKey(type: EntityType, rawKey: string, title: string, data: Record<string, unknown>): string {
  const spec = ENTITIES[type];
  let base = spec.singletonKey ?? slugify(rawKey);
  if (type === 'offer') base = String(data.kind ?? 'cta');
  if (!base) base = slugify(nameOf(data)) || slugify(title) || slugify(String(data[spec.lead] ?? '')) || 'untitled';
  const scope = [data.market, data.plan].map((v) => slugify(typeof v === 'string' ? v : '')).filter(Boolean).join('.');
  return scope ? `${base}@${scope}` : base;
}

/** Passages of about `size` words, each starting `overlap` words before the last one ended. */
export function chunkText(text: string, size = 240, overlap = 40): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const chunks: string[] = [];
  for (let start = 0; start < words.length; start += size - overlap) {
    chunks.push(words.slice(start, start + size).join(' '));
    if (start + size >= words.length) break;
  }
  return chunks;
}

function fieldText(value: unknown): string {
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string' && v).join(', ');
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value > 0 ? String(value) : '';
  return '';
}

/** What full-text search and the embedding see. */
export function searchText(type: EntityType, title: string, data: Record<string, unknown>): string {
  const parts = Object.keys(ENTITIES[type].fields)
    .filter((name) => !name.endsWith('_url') && !name.endsWith('_urls'))
    .map((name) => fieldText(data[name]))
    .filter(Boolean);
  return [title, ...parts].join('. ').slice(0, 4000);
}

// ---------------------------------------------------------------- drafting

export type DraftOptions = {
  now: Date;
  extractedBy: string;
  /**
   * Set when a person is the author of the source (a survey answer, a row a
   * person typed or approved). userId is null when who it was is not recorded.
   */
  human?: { userId: string | null };
};

/**
 * Turns one extracted item into a record, applying the trust rules:
 * - a type the source's tier may not assert is dropped (returns null);
 * - an excerpt that is not in the source makes the record model inference:
 *   tier 6, unconfirmed, context only, with no excerpt kept;
 * - a quote must itself be word for word in the source;
 * - confidence, usage and freshness come from rules, never from the model.
 */
export function buildDraft(type: EntityType, item: ExtractedItem, source: SourceLike, opts: DraftOptions): FactDraft | null {
  if (!allowedEntityTypes(source.authority_tier).includes(type)) return null;
  const data = normaliseData(type, item.data);
  const lead = fieldText(data[ENTITIES[type].lead]);
  const title = (item.title ?? '').trim() || nameOf(data) || lead.slice(0, 80);
  if (!lead && !title) return null;

  let verbatim = excerptInSource(item.excerpt ?? '', source.content);
  if (type === 'quote' && !excerptInSource(String(data.text ?? ''), source.content)) verbatim = false;

  const tier: AuthorityTier = verbatim ? source.authority_tier : 6;
  const evidence: Evidence = {
    // What a person wrote is confirmed only as far as they actually wrote it.
    confirmed: !!opts.human && verbatim,
    tier,
    verbatim,
    sourceCount: verbatim ? 1 : 0,
  };
  const freshness = freshnessFor(type, data);
  const nowIso = opts.now.toISOString();
  const endsOn = type === 'offer' && typeof data.ends_on === 'string' ? Date.parse(data.ends_on) : NaN;
  return {
    entity_type: type,
    key: factKey(type, item.key ?? '', title, data),
    title,
    data,
    status: statusFor(evidence),
    confidence: computeConfidence(evidence),
    authority_tier: tier,
    usage: decideUsage(type, data, evidence),
    freshness,
    sources: [{ source_id: source.id, excerpt: verbatim ? item.excerpt.trim() : '' }],
    extracted_by: opts.extractedBy,
    confirmed_by: evidence.confirmed ? opts.human?.userId ?? null : null,
    confirmed_at: evidence.confirmed ? nowIso : null,
    valid_until: Number.isFinite(endsOn) ? new Date(endsOn).toISOString() : null,
    last_verified_at: verbatim ? source.captured_at ?? nowIso : null,
    recheck_after: recheckAfter(freshness, opts.now),
    supersedes: null,
  };
}

// ---------------------------------------------------------------- contradictions

const STOPWORDS = new Set(['a', 'an', 'the', 'of', 'for', 'to', 'and', 'or', 'on', 'in', 'with', 'per', 'is', 'are', 'your', 'you', 'it', 'at', 'by']);

function numbersIn(text: string): string[] {
  return [...new Set((text.replace(/(\d),(?=\d{3})/g, '$1').match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n))))];
}

function contentWords(text: string): string[] {
  return normaliseText(text).split(/[^a-z0-9]+/).filter((w) => w && !STOPWORDS.has(w));
}

export type Difference = { field: string; a: string; b: string };

/**
 * The field on which two records about the same subject genuinely disagree,
 * or null. Rewording is not disagreement: "7-day free trial" and "try it free
 * for 7 days" agree, "7-day" and "3-day" do not, and a vaguer statement
 * ("free trial") does not contradict a more specific one. Only the fields an
 * entity declares as hard (terms, value, gating, claim status) are compared.
 */
export function materialDifference(type: EntityType, a: Record<string, unknown>, b: Record<string, unknown>): Difference | null {
  for (const field of ENTITIES[type].conflictFields) {
    const av = fieldText(a[field]).trim();
    const bv = fieldText(b[field]).trim();
    if (!av || !bv || normaliseText(av) === normaliseText(bv)) continue;
    if (type === 'claim' && field === 'status') {
      // needs_substantiation is a waiting state, not a position.
      if ([av, bv].includes('approved') && [av, bv].includes('banned')) return { field, a: av, b: bv };
      continue;
    }
    const an = numbersIn(av);
    const bn = numbersIn(bv);
    if (an.length && bn.length) {
      const subset = (x: string[], y: string[]) => x.every((n) => y.includes(n));
      if (!subset(an, bn) && !subset(bn, an)) return { field, a: av, b: bv };
      continue;
    }
    if (an.length || bn.length) continue;
    const aw = contentWords(av);
    const bw = new Set(contentWords(bv));
    if (aw.length && bw.size && !aw.some((w) => bw.has(w))) return { field, a: av, b: bv };
  }
  return null;
}

// A disagreement on these means a creator could state something false, so
// neither side may be stated until a person decides.
const GATED_ON_CONFLICT: EntityType[] = ['claim', 'offer', 'proof'];

const LIVE = ['inferred', 'confirmed', 'stale'];

function rank(f: Pick<BrainFact, 'status' | 'authority_tier'>): number {
  return f.status === 'confirmed' ? 1 : f.authority_tier;
}

function mergeSources(a: FactSourceRef[], b: FactSourceRef[]): FactSourceRef[] {
  const out = [...a];
  for (const s of b) {
    const at = out.findIndex((o) => o.source_id === s.source_id);
    if (at < 0) out.push(s);
    else if (!out[at].excerpt && s.excerpt) out[at] = s;
  }
  return out.slice(-8);
}

export type UpsertPlan = {
  action: 'insert' | 'merge' | 'ignore' | 'supersede' | 'conflict';
  reason: string;
  /** Applied to the existing live record, before any insert. */
  update?: { id: string; patch: Partial<FactDraft> };
  insert?: FactDraft;
  conflict?: {
    field: string;
    winner: 'existing' | 'incoming';
    existingValue: string;
    incomingValue: string;
  };
};

/**
 * Decides what happens when a record arrives for a key that may already be
 * taken. `siblings` is every stored record with the same type and key,
 * whatever its status.
 *
 * - Nothing live: insert, unless a person already rejected this value or it
 *   is already sitting in a dispute.
 * - Same value: merge. Sources accumulate, a second independent source raises
 *   confidence, a better tier takes over the wording. A person's record is
 *   never rewritten by a scan.
 * - Different value from a person: the old record is superseded quietly; the
 *   person is the authority.
 * - Different value otherwise: a conflict. The higher authority wins, then the
 *   newer; the loser is kept as disputed. For claims, offers and proof neither
 *   may be stated until a person resolves it.
 */
export function planUpsert(
  siblings: BrainFact[],
  incoming: FactDraft,
  now: Date,
  opts: { liveInOpenConflict?: boolean } = {},
): UpsertPlan {
  const type = incoming.entity_type;
  const live = siblings.find((s) => LIVE.includes(s.status));
  const byPerson = incoming.status === 'confirmed';

  if (!byPerson) {
    const settled = siblings.find(
      (s) => (s.status === 'retired' || s.status === 'disputed') && !materialDifference(type, s.data, incoming.data),
    );
    if (settled) {
      return {
        action: 'ignore',
        reason: settled.status === 'retired' ? 'this value was rejected before' : 'this value is already in dispute',
      };
    }
  }
  if (!live) return { action: 'insert', reason: 'new record', insert: incoming };

  const diff = materialDifference(type, live.data, incoming.data);
  const nowIso = now.toISOString();

  if (!diff) {
    const sources = mergeSources(live.sources, incoming.sources);
    if (live.status === 'confirmed' && !byPerson) {
      return {
        action: 'merge',
        reason: 'corroborates a confirmed record',
        update: { id: live.id, patch: { sources, last_verified_at: nowIso, recheck_after: recheckAfter(live.freshness, now) } },
      };
    }
    const incomingLeads = byPerson || incoming.authority_tier < live.authority_tier;
    const lead = incomingLeads ? incoming : live;
    const other = incomingLeads ? live : incoming;
    // The better source's wording, with gaps filled from the other.
    const data: Record<string, unknown> = { ...lead.data };
    for (const [name, value] of Object.entries(other.data)) {
      if (!fieldText(data[name]) && fieldText(value)) data[name] = value;
    }
    const evidence: Evidence = {
      confirmed: byPerson,
      tier: Math.min(live.authority_tier, incoming.authority_tier) as AuthorityTier,
      verbatim: sources.some((s) => !!s.excerpt),
      sourceCount: sources.filter((s) => !!s.excerpt).length,
    };
    const freshness = freshnessFor(type, data);
    const usage = decideUsage(type, data, evidence);
    return {
      action: 'merge',
      reason: byPerson ? 'confirmed by a person' : 'same value from another source',
      update: {
        id: live.id,
        patch: {
          title: lead.title,
          data,
          sources,
          status: statusFor(evidence),
          authority_tier: evidence.verbatim ? evidence.tier : 6,
          confidence: Math.max(computeConfidence(evidence), byPerson ? 1 : 0),
          // A scan never lifts a block, or the hold placed on a record in dispute.
          usage: live.usage === 'blocked' || (opts.liveInOpenConflict && !byPerson) ? live.usage : usage,
          freshness,
          confirmed_by: byPerson ? incoming.confirmed_by : live.confirmed_by,
          confirmed_at: byPerson ? incoming.confirmed_at : live.confirmed_at,
          valid_until: incoming.valid_until ?? live.valid_until,
          last_verified_at: nowIso,
          recheck_after: recheckAfter(freshness, now),
          extracted_by: incomingLeads ? incoming.extracted_by : live.extracted_by,
        },
      },
    };
  }

  if (byPerson) {
    return {
      action: 'supersede',
      reason: 'a person stated a different value',
      update: { id: live.id, patch: { status: 'retired' } },
      insert: { ...incoming, supersedes: live.id },
    };
  }

  const incomingWins = rank(incoming) <= rank(live);
  const gated = GATED_ON_CONFLICT.includes(type);
  const hold = <T extends { usage: BrainFact['usage'] }>(f: T) => (gated && f.usage === 'generation_ok' ? 'context_only' : f.usage);
  const conflict = { field: diff.field, existingValue: diff.a, incomingValue: diff.b };
  if (incomingWins) {
    return {
      action: 'conflict',
      reason: `${diff.field} differs; the new source has equal or higher authority`,
      update: { id: live.id, patch: { status: 'disputed', usage: hold(live) } },
      insert: { ...incoming, usage: hold(incoming), supersedes: live.id },
      conflict: { ...conflict, winner: 'incoming' },
    };
  }
  return {
    action: 'conflict',
    reason: `${diff.field} differs; the stored record has higher authority`,
    update: { id: live.id, patch: { usage: hold(live) } },
    insert: { ...incoming, status: 'disputed', usage: 'context_only' },
    conflict: { ...conflict, winner: 'existing' },
  };
}

/** The patch that makes a record a person's own: tier 1, confirmed, full confidence. */
export function humanPatch(
  fact: Pick<BrainFact, 'entity_type' | 'data' | 'title'>,
  userId: string,
  now: Date,
  edit: { title?: string; data?: unknown } = {},
): Partial<FactDraft> {
  const type = fact.entity_type;
  const data = edit.data === undefined ? { ...fact.data } : normaliseData(type, { ...fact.data, ...(edit.data as Record<string, unknown>) });
  // Confirming a claim that was waiting for a decision is the decision.
  const editedStatus = (edit.data as Record<string, unknown> | undefined)?.status;
  if (type === 'claim' && data.status === 'needs_substantiation' && editedStatus === undefined) data.status = 'approved';
  const evidence: Evidence = { confirmed: true, tier: 1, verbatim: true, sourceCount: 1 };
  const freshness = freshnessFor(type, data);
  const nowIso = now.toISOString();
  return {
    title: edit.title?.trim() || fact.title,
    data,
    status: 'confirmed',
    authority_tier: 1,
    confidence: computeConfidence(evidence),
    usage: decideUsage(type, data, evidence),
    freshness,
    confirmed_by: userId,
    confirmed_at: nowIso,
    last_verified_at: nowIso,
    // Even a person's word is asked about again once its class says it may have moved.
    recheck_after: recheckAfter(freshness, now),
    ...(edit.data !== undefined || edit.title ? { extracted_by: 'human' } : {}),
  };
}

// ---------------------------------------------------------------- rendering

const usable = (f: BrainFact, now: Date) =>
  (f.status === 'inferred' || f.status === 'confirmed') &&
  f.usage !== 'blocked' &&
  !(f.valid_until && Date.parse(f.valid_until) < now.getTime());

/** A volatile record (a price, a trial, a number) that has not been re-checked in time. */
export function overdue(f: Pick<BrainFact, 'freshness' | 'recheck_after'>, now: Date): boolean {
  return f.freshness === 'volatile' && !!f.recheck_after && Date.parse(f.recheck_after) < now.getTime();
}

// Confirmed first, then by confidence, then by key and id so the order never
// depends on what the database happened to return.
function stable(a: BrainFact, b: BrainFact): number {
  return (
    Number(b.status === 'confirmed') - Number(a.status === 'confirmed') ||
    b.confidence - a.confidence ||
    a.key.localeCompare(b.key) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * One record as a line of labelled text: id first so a generator can cite
 * it, the main field, then whatever else is filled in. An unconfirmed record
 * says so, and the generator is told to treat it as a hypothesis.
 */
export function renderFact(f: BrainFact, now?: Date): string {
  const spec = ENTITIES[f.entity_type];
  const lead = fieldText(f.data[spec.lead]);
  const rest = Object.keys(spec.fields)
    .filter((name) => name !== spec.lead && !name.endsWith('_url') && !name.endsWith('_urls'))
    .map((name) => {
      const value = f.data[name];
      const text = value === true ? 'yes' : fieldText(value);
      if (!text || text === 'unknown' || normaliseText(text) === normaliseText(f.title)) return '';
      return `${name.replace(/_/g, ' ')}: ${text}`;
    })
    .filter(Boolean);
  const flags = [
    f.status === 'confirmed' ? '' : 'unconfirmed',
    now && overdue(f, now) ? 'not re-checked recently, do not state the figures' : '',
  ].filter(Boolean);
  const head = lead && normaliseText(lead) !== normaliseText(f.title) ? `${f.title}: ${lead}` : f.title;
  return `- [${f.id}] ${head}${rest.length ? `. ${rest.join('; ')}` : ''}${flags.length ? ` (${flags.join('; ')})` : ''}`;
}

function section(label: string, lines: string[]): string {
  return lines.length ? `${label}\n${lines.join('\n')}` : '';
}

const CORE: Array<{ type: EntityType; cap: number }> = [
  { type: 'company', cap: 1 },
  { type: 'product', cap: 3 },
  { type: 'feature', cap: 12 },
  { type: 'offer', cap: 8 },
  { type: 'persona', cap: 4 },
  { type: 'pain', cap: 8 },
  { type: 'outcome', cap: 4 },
  { type: 'differentiator', cap: 6 },
  { type: 'voice_rule', cap: 6 },
  { type: 'creator_pref', cap: 2 },
  { type: 'goal', cap: 2 },
];

const CORE_HEADER =
  'What is known about the company. Each line starts with the record id in brackets. A line marked unconfirmed came from a source but no person has checked it: treat it as a hypothesis, never as something to assert.';

/** Records that are always shown: confirmed ones and those stated word for word by a first-party source. */
export function coreFacts(facts: BrainFact[], now: Date): BrainFact[] {
  return CORE.flatMap(({ type, cap }) =>
    facts
      .filter((f) => f.entity_type === type && usable(f, now) && (f.status === 'confirmed' || f.confidence >= 0.8))
      .sort(stable)
      .slice(0, cap)
  );
}

const EMPTY_CORE_SUFFIX = ': nothing confirmed or sourced is known yet.';

/** True for the one line `renderCore` returns when no record qualifies. */
export function isEmptyCore(core: string): boolean {
  return core.trim().endsWith(EMPTY_CORE_SUFFIX);
}

/** The stable, always-injected half of the context. Same records in, same bytes out. */
export function renderCore(facts: BrainFact[], productName: string, now: Date): string {
  const chosen = coreFacts(facts, now);
  const sections = CORE.map(({ type }) =>
    section(ENTITIES[type].label, chosen.filter((f) => f.entity_type === type).map((f) => renderFact(f, now)))
  ).filter(Boolean);
  if (!sections.length) return `${productName}${EMPTY_CORE_SUFFIX}`;
  return [`${productName}\n${CORE_HEADER}`, ...sections].join('\n\n');
}

/**
 * Rules a generator must never miss, so they are always given in full and
 * never left to similarity search. Unconfirmed rules are included too: a
 * restriction that turns out to be unnecessary costs little.
 */
export function renderConstraints(facts: BrainFact[], now: Date): string {
  const live = facts.filter((f) => usable(f, now)).sort(stable);
  const of = (type: EntityType) => live.filter((f) => f.entity_type === type);
  const mark = (f: BrainFact) => (f.status === 'confirmed' ? '' : ' (unconfirmed)');
  const s = (v: unknown) => fieldText(v);

  const neverSay = of('claim')
    .filter((f) => f.data.status === 'banned')
    .map((f) => `- [${f.id}] "${s(f.data.wording)}"${s(f.data.reason) ? `: ${s(f.data.reason)}` : ''}${mark(f)}`);
  const required = [
    ...of('claim')
      .filter((f) => f.data.status === 'approved' && s(f.data.qualifier))
      .map((f) => `- [${f.id}] When saying "${s(f.data.wording)}", add: ${s(f.data.qualifier)}${mark(f)}`),
    ...of('offer')
      .filter((f) => s(f.data.required_wording))
      .map((f) => `- [${f.id}] ${f.title}: use the words "${s(f.data.required_wording)}"${mark(f)}`),
    ...of('compliance')
      .filter((f) => s(f.data.wording))
      .map((f) => `- [${f.id}] ${s(f.data.rule)} Wording: "${s(f.data.wording)}"${mark(f)}`),
  ];
  const neverShow = [
    ...of('compliance')
      .filter((f) => f.data.kind === 'must_not_show' && !s(f.data.wording))
      .map((f) => `- [${f.id}] ${s(f.data.rule)}${mark(f)}`),
    ...of('demo_moment')
      .filter((f) => s(f.data.must_not_show))
      .map((f) => `- [${f.id}] In "${f.title}": ${s(f.data.must_not_show)}${mark(f)}`),
  ];
  const rules = of('compliance')
    .filter((f) => f.data.kind !== 'must_not_show' && !s(f.data.wording))
    .map((f) => `- [${f.id}] ${s(f.data.rule)}${mark(f)}`);
  const words = [
    ...of('glossary').map((f) => {
      const never = s(f.data.never_use);
      const say = s(f.data.pronunciation);
      return `- [${f.id}] Write "${s(f.data.written_form) || s(f.data.term) || f.title}"${say ? `, said "${say}"` : ''}${never ? `; never ${never}` : ''}${f.data.internal_only === true ? '; internal term, do not use with customers' : ''}${mark(f)}`;
    }),
    ...of('voice_rule')
      .filter((f) => s(f.data.banned_words))
      .map((f) => `- [${f.id}] Never use: ${s(f.data.banned_words)}${mark(f)}`),
  ];
  const unnamed = of('alternative').filter((f) => f.data.type === 'direct' && f.data.may_name !== true);
  const competitors = unnamed.length
    ? [`- Do not name these competitors; describe the old way instead: ${unnamed.map((f) => s(f.data.name) || f.title).join(', ')}`]
    : [];

  const out = [
    section('Never say', neverSay),
    section('Required wording', required),
    section('Never show', neverShow),
    section('Rules', rules),
    section('Words', words),
    section('Competitors', competitors),
  ].filter(Boolean);
  return out.length ? out.join('\n\n') : 'No rules have been recorded yet. State nothing about the product that is not in the approved claims.';
}

/**
 * The phrases in `renderConstraints` that code can match exactly: banned
 * claim wordings, glossary never-use variants and banned words from voice
 * rules. Same records and order as the prose, lower-cased and de-duplicated.
 */
export function bannedPhrases(facts: BrainFact[], now: Date): string[] {
  const live = facts.filter((f) => usable(f, now)).sort(stable);
  const list = (v: unknown): string[] =>
    (Array.isArray(v) ? v : typeof v === 'string' ? [v] : []).filter((x): x is string => typeof x === 'string');
  const raw: string[] = [];
  for (const f of live) {
    if (f.entity_type === 'claim' && f.data.status === 'banned') raw.push(...list(f.data.wording));
    else if (f.entity_type === 'glossary') raw.push(...list(f.data.never_use));
    else if (f.entity_type === 'voice_rule') raw.push(...list(f.data.banned_words));
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const phrase = r.replace(/\s+/g, ' ').trim().replace(/^["'“‘]+|["'”’.]+$/g, '').toLowerCase();
    // One letter matches too much to be a useful check.
    if (phrase.length < 2 || seen.has(phrase)) continue;
    seen.add(phrase);
    out.push(phrase);
  }
  return out;
}

/** Query-dependent records, grouped by type, in the order they were ranked. */
export function renderRetrieved(facts: BrainFact[], now: Date): string {
  const types = [...new Set(facts.map((f) => f.entity_type))];
  return types
    .map((type) => section(ENTITIES[type].label, facts.filter((f) => f.entity_type === type).map((f) => renderFact(f, now))))
    .filter(Boolean)
    .join('\n\n');
}

/** Claims a creator may say: approved by a person, in force and re-checked in time. */
export function approvedClaims(facts: BrainFact[], now: Date): ApprovedClaim[] {
  return facts
    .filter(
      (f) =>
        f.entity_type === 'claim' &&
        f.status === 'confirmed' &&
        f.usage === 'generation_ok' &&
        f.data.status === 'approved' &&
        usable(f, now) &&
        !overdue(f, now),
    )
    .sort(stable)
    .map((f) => ({ id: f.id, wording: fieldText(f.data.wording), qualifier: fieldText(f.data.qualifier) || null }));
}

/** Moments a creator can film, the aha moment first. Media falls back to the linked feature's first capture. */
export function demoMoments(facts: BrainFact[], now: Date): DemoMomentRef[] {
  const features = facts.filter((f) => f.entity_type === 'feature' && usable(f, now));
  return facts
    .filter((f) => f.entity_type === 'demo_moment' && usable(f, now) && f.usage === 'generation_ok')
    .sort((a, b) => Number(b.data.is_aha === true) - Number(a.data.is_aha === true) || stable(a, b))
    .slice(0, 12)
    .map((f) => {
      const featureKey = slugify(fieldText(f.data.feature));
      const feature = featureKey ? features.find((x) => x.key === featureKey || slugify(x.title) === featureKey) : undefined;
      const featureMedia = Array.isArray(feature?.data.media_urls) ? (feature.data.media_urls[0] as string | undefined) : undefined;
      return {
        id: f.id,
        title: f.title,
        start_state: fieldText(f.data.start_state),
        user_action: fieldText(f.data.user_action),
        end_state: fieldText(f.data.end_state),
        seconds: typeof f.data.seconds === 'number' && f.data.seconds > 0 ? f.data.seconds : null,
        media_url: fieldText(f.data.media_url) || featureMedia || null,
      };
    });
}

/**
 * Records one hop away from the ones retrieved: the feature a demo moment
 * shows, the persona a pain belongs to, the pain an angle starts from.
 * Following links finds what similarity would miss.
 */
export function linkedFacts(seeds: BrainFact[], all: BrainFact[], now: Date): BrainFact[] {
  const LINKS: Array<[field: string, target: EntityType]> = [
    ['feature', 'feature'],
    ['persona', 'persona'],
    ['pain', 'pain'],
    ['differentiator', 'differentiator'],
  ];
  const seen = new Set(seeds.map((f) => f.id));
  const out: BrainFact[] = [];
  for (const seed of seeds) {
    for (const [field, target] of LINKS) {
      const ref = slugify(fieldText(seed.data[field]));
      if (!ref) continue;
      const hit = all.find((f) => f.entity_type === target && usable(f, now) && (f.key === ref || slugify(f.title) === ref));
      if (hit && !seen.has(hit.id)) {
        seen.add(hit.id);
        out.push(hit);
      }
    }
  }
  return out;
}

/** Everything recorded for one persona: its pains, objections and the quotes that sound like it. */
export function personaFacts(personaKey: string, all: BrainFact[], now: Date): BrainFact[] {
  const persona = all.find((f) => f.entity_type === 'persona' && f.key === personaKey && usable(f, now));
  if (!persona) return [];
  const names = new Set([persona.key, slugify(persona.title), slugify(fieldText(persona.data.label))]);
  const theirs = all
    .filter((f) => ['pain', 'objection', 'quote'].includes(f.entity_type) && usable(f, now) && names.has(slugify(fieldText(f.data.persona))))
    .sort(stable);
  return [persona, ...theirs];
}

// ---------------------------------------------------------------- coverage

type CoverageItem = {
  key: string;
  weight: number;
  /** Shown in `missing` when nothing usable exists. */
  absent: string;
  /** Shown when something was found but no person has confirmed it. */
  unconfirmed: string;
  pick: (facts: BrainFact[]) => BrainFact[][];
  /** Only a confirmed record counts (claims: a source cannot approve itself). */
  confirmedOnly?: true;
};

const has = (f: BrainFact, ...fields: string[]) => fields.every((name) => !!fieldText(f.data[name]));
const ofType = (facts: BrainFact[], type: EntityType) => facts.filter((f) => f.entity_type === type);

// What a brief cannot be written well without, heaviest first. Weights sum to 1.
export const COVERAGE: CoverageItem[] = [
  {
    key: 'aha_moment',
    weight: 0.18,
    absent: 'The aha moment: no demo a creator can film (what is on screen, what they tap, what appears).',
    unconfirmed: 'The aha moment was found in a source but nobody has confirmed it.',
    pick: (f) => [ofType(f, 'demo_moment').filter((d) => d.data.is_aha === true && has(d, 'user_action', 'end_state'))],
  },
  {
    key: 'persona_pain',
    weight: 0.16,
    absent: 'Who it is for: no customer situation with a pain attached.',
    unconfirmed: 'The customer and their pain come from sources only; nobody has confirmed them.',
    pick: (f) => [ofType(f, 'persona').filter((p) => has(p, 'situation')), ofType(f, 'pain')],
  },
  {
    key: 'offer',
    weight: 0.14,
    absent: 'The offer: what a viewer should do next and what they get.',
    unconfirmed: 'The offer was read from a source but nobody has confirmed the terms.',
    pick: (f) => [ofType(f, 'offer').filter((o) => has(o, 'terms'))],
  },
  {
    key: 'approved_claims',
    weight: 0.14,
    absent: 'Approved claims: nothing a creator is cleared to say about the product.',
    unconfirmed: 'Approved claims: nothing a creator is cleared to say about the product.',
    pick: (f) => [ofType(f, 'claim').filter((c) => c.data.status === 'approved' && c.usage === 'generation_ok')],
    confirmedOnly: true,
  },
  {
    key: 'differentiator',
    weight: 0.1,
    absent: 'What only this product can say.',
    unconfirmed: 'A differentiator was found on the company\'s own pages but nobody has confirmed it is true and unique.',
    pick: (f) => [ofType(f, 'differentiator')],
  },
  {
    key: 'basics',
    weight: 0.08,
    absent: 'A plain one line description of the product.',
    unconfirmed: 'The product description comes from the website and has not been confirmed.',
    pick: (f) => [[...ofType(f, 'product'), ...ofType(f, 'company')].filter((p) => has(p, 'one_liner'))],
  },
  {
    key: 'proof',
    weight: 0.06,
    absent: 'Proof: numbers or results that are true and safe to say.',
    unconfirmed: 'Proof was found but nobody has confirmed it is typical and current.',
    pick: (f) => [ofType(f, 'proof')],
  },
  {
    key: 'alternative',
    weight: 0.05,
    absent: 'What customers use instead today.',
    unconfirmed: 'The alternatives are inferred from sources and not confirmed.',
    pick: (f) => [ofType(f, 'alternative')],
  },
  {
    key: 'objection',
    weight: 0.04,
    absent: 'The main hesitation and the honest answer to it.',
    unconfirmed: 'An objection was found but the company has not given its answer.',
    pick: (f) => [ofType(f, 'objection').filter((o) => has(o, 'answer'))],
  },
  {
    key: 'never_say',
    weight: 0.03,
    absent: 'What a creator must never claim or show.',
    unconfirmed: 'The never say list is inferred and not confirmed.',
    pick: (f) => [[...ofType(f, 'claim').filter((c) => c.data.status === 'banned'), ...ofType(f, 'compliance')]],
  },
  {
    key: 'messenger',
    weight: 0.02,
    absent: 'Who should be on camera and how closely they follow a script.',
    unconfirmed: 'Creator fit is inferred and not confirmed.',
    pick: (f) => [[...ofType(f, 'creator_pref'), ...ofType(f, 'voice_rule')]],
  },
];

/**
 * How much the brain knows, 0 to 1. A confirmed record earns the full
 * weight; a record stated word for word by a first-party source earns half,
 * because it is traceable but nobody has stood behind it; guesses earn
 * nothing. `missing` lists the gaps, heaviest first.
 */
export function computeCoverage(facts: BrainFact[], now: Date): { coverage: number; missing: string[] } {
  const live = facts.filter((f) => usable(f, now));
  let total = 0;
  const missing: string[] = [];
  for (const item of COVERAGE) {
    const credit = Math.min(
      ...item.pick(live).map((group) =>
        Math.max(0, ...group.map((f) => (f.status === 'confirmed' ? 1 : !item.confirmedOnly && f.confidence >= 0.8 ? 0.5 : 0)))
      ),
    );
    total += item.weight * credit;
    if (credit === 0) missing.push(item.absent);
    else if (credit < 1) missing.push(item.unconfirmed);
  }
  return { coverage: Math.round(total * 100) / 100, missing };
}

// ---------------------------------------------------------------- review order

/**
 * The order a person should look at records in: those in an open conflict,
 * then disputed, stale and overdue ones, then guesses from least to most
 * certain, and confirmed records last.
 */
export function reviewOrder(facts: BrainFact[], inConflict: Set<string>, now: Date): BrainFact[] {
  const bucket = (f: BrainFact) => {
    if (inConflict.has(f.id)) return 0;
    if (f.status === 'disputed') return 1;
    if (f.status === 'stale' || overdue(f, now)) return 2;
    if (f.status === 'inferred') return 3;
    if (f.status === 'confirmed') return 4;
    return 5;
  };
  return [...facts].sort(
    (a, b) => bucket(a) - bucket(b) || a.confidence - b.confidence || a.key.localeCompare(b.key) || a.id.localeCompare(b.id),
  );
}

/** One open conflict as a sentence for a generator. */
export function renderConflict(c: { entity_type: string; key: string; field: string; values: Array<{ value: string }> }): string {
  const label = ENTITIES[c.entity_type as EntityType]?.label ?? c.entity_type;
  return `${label} "${c.key}": sources disagree on ${c.field} (${c.values.map((v) => `"${v.value}"`).join(' versus ')}). State neither until the company resolves it.`;
}
