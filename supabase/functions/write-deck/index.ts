// write-deck: the AI writer behind the stepped brief editor, for slideshows
// and reels. Campaign manager only. Nothing is saved; the editor applies the
// result.
//
// Body: { brief_id?, format: 'slideshow' | 'reel', kind: 'handheld' | 'story',
//   post_type: { id, key, name, about, example } | null, mode,
//   slides: [{ role: 'cover' | 'point' | 'cta', text, shot, inset_feature_id, place? }],
//   caption?, hashtags?, search_phrase?, feature_id?, feedback? }
//
// CTA placement comes from the CTA slide's place: after_hook (every creator
// plugs right after the hook), end (it closes the post) or any (each creator
// places it, so it has to work anywhere). Slides sent without a place (the
// creator's own asks) fall back to deck order: a CTA at index 1 with slides
// after it opens the post, a Handheld CTA last of several body slides closes it.
// Numbered posts number every body slide by deck order either way.
//
// Modes:
//   ideas    -> { ideas: [{ cover, say, count, angle }] }  six covers for this
//               post type that do not repeat this week or recent posts
//   cover | points | cta | details | all | revise
//            -> { slides: [{ text, shot, feature_id, changed }], caption,
//                 hashtags, search_phrase, note, warnings }
//               The deck comes back in the same length and order. Slides
//               outside the mode, and slides the manager typed (outside
//               revise), come back exactly as sent.
//   review   -> { score, verdict, fixes: [{ i, problem, text, shot }] }
//               A second read of the finished post, the way a strict
//               campaign manager would read it, with ready to apply fixes.
//   chat     -> { reply, ideas: [{ format, post_type_id, kind, cover, say,
//                 count, angle, preview }], chips }
//               The idea chat. Body: { mode: 'chat', campaign_id, messages:
//               [{ role: 'user' | 'assistant', text }], format_hint?,
//               shown? (covers already pitched) }. Reads the week's slots
//               (which formats still have empty ones, what is already in
//               it) and recent posts. Campaign managers only.
//   draft    -> { cover, slides: [{ role, text, shot, feature_id }], caption,
//                 hashtags, search_phrase, warnings }
//               Fill my week: ONE complete Handheld post in ONE call, cover
//               included. Body: { mode: 'draft', campaign_id, brief_id,
//               format, kind: 'handheld', post_type, count, avoid } where
//               avoid holds the covers already in the week or drafted in this
//               run. The deck is cover, the body slides and one CTA (place
//               any). Same rules, checks and targeted repair as the write
//               modes, inside a deadline the client's 60s timeout can wait
//               for. Campaign managers only.
//   make     -> { format, post_type_id, kind: 'handheld', cover, say, slides:
//                 [{ role, text, shot, feature_id, place? }], caption,
//                 hashtags, search_phrase, source_note, warnings }
//               The Library: the best post for a typed idea, or a remix of a
//               reference post. Body: { mode: 'make', idea?, reference_id? |
//               url?, direction?, format?: 'slideshow' | 'reel' | null (null:
//               the AI picks), post_type?: id | null, avoid? }. A reference
//               reads its stored study (study-reference ran first), keeps its
//               format, structure, cover template and CTA spot, and swaps the
//               topic per the direction. One writing call for format, type and
//               the whole deck, then the same checks and targeted repair as
//               draft. Handheld only. Campaign managers only.

import {
  adminClient,
  askClaude,
  authenticate,
  handleCors,
  jsonResponse,
  loadBrandContext,
  parseClaudeJson,
  stripDashes,
  type BrandContext,
} from '../_shared/wp8.ts';
import { brandAudience } from '../_shared/brandVoice.ts';
import { brandDocBlocks as baseDocBlocks } from '../_shared/generateBrief.ts';
import { loadStudy, loadStudyById, patternLines, type PatternCard } from '../_shared/referenceStudy.ts';
import { checkDeck, dropColons, HEDGES, overlap, slopHits, words, type CtaPlace, type InSlide, type OutSlide } from './checks.ts';
import { chatRejected, chatTask, chatTurns, chatTypesBlock, normalizeChat, rejectedBlock, transcript, type ChatRaw, type DismissRow } from './chat.ts';
import {
  ideaRules,
  isShortMake,
  makeAnswer,
  makeTypes,
  makeTypesBlock,
  normalizeMade,
  normalizeShort,
  pinnedIdeaRules,
  readMakeIdea,
  remixRules,
  shortRules,
  sourceBlock,
  type Made,
  type MakeRaw,
  type MakeSource,
  type ShortRaw,
} from './make.ts';
import {
  CTA_NUDGE,
  CUE_RULE,
  DETAILS_RULES,
  feedbackBlock,
  PLATFORM_RULES,
  type FeedbackRow,
  specFor,
  storyNote,
  storyShape,
  VOICE_RULES,
  type Format,
  type TypeSpec,
} from './specs.ts';

type Mode = 'ideas' | 'cover' | 'points' | 'cta' | 'details' | 'revise' | 'all' | 'review' | 'chat' | 'draft' | 'make';
type PostTypeIn = { id: string; key?: string; name: string; about?: string; example?: string };

type Body = {
  brief_id?: string;
  format?: Format;
  kind?: 'handheld' | 'story' | 'open';
  post_type?: PostTypeIn | null;
  mode?: Mode;
  slides?: InSlide[];
  caption?: string;
  hashtags?: string[];
  search_phrase?: string;
  feature_id?: string | null;
  feedback?: string;
  /** Write exactly these slide indexes (creator asks, single line rewrites). */
  only?: number[];
  /** ideas: covers already shown; treated as taken. */
  exclude?: string[];
  /** chat: the week the manager is planning. */
  campaign_id?: string;
  /** chat: the conversation, oldest first. */
  messages?: unknown;
  /** chat: the format of the slot the chat was opened from. */
  format_hint?: Format | null;
  /** chat: covers already pitched in this chat; treated as taken. */
  shown?: string[];
  /** draft: covers already in the week or drafted in this run; treated as taken. */
  avoid?: string[];
  /** draft: body slides including the CTA. */
  count?: number;
  /** make: the typed idea. */
  idea?: string;
  /** make: the reference_studies row of the pasted post. */
  reference_id?: string;
  /** make: the pasted post, when the study id is not known. */
  url?: string;
  /** make: what ours should be about. */
  direction?: string;
};

type DeckOut = {
  note?: string;
  slides?: { i?: number; text?: string; shot?: string; feature_id?: string | null }[];
  caption?: string;
  hashtags?: string[];
  search_phrase?: string;
};

type IdeaOut = { cover?: string; say?: string; count?: number; angle?: string };
type ReviewOut = { score?: number; verdict?: string; fixes?: { i?: number; problem?: string; text?: string; shot?: string }[] };

/**
 * Rejects when p has not settled within ms, so no lookup can hold a request
 * open. The underlying work is not cancelled; its result is ignored.
 */
function within<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} took too long. Try again.`)), ms);
  });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

/** A fetch aborted by its timeout signal. */
const tooLong = (e: unknown) => e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');

/** Context lookups (brand, covers, examples) never wait longer than this. */
const LOOKUP_MS = 10_000;
/** One model call in the editor modes. */
const CALL_MS = 90_000;
/** draft: the whole request, first pass and repair, inside the client's 60s. */
const DRAFT_BUDGET_MS = 55_000;
/** make: the whole request, the writing call and one repair. */
const MAKE_BUDGET_MS = 110_000;

/**
 * Deck index of a creator placed CTA among n body slides: a little past the
 * middle. Mirrors ctaSlot(n, 'any') in the editor (useBriefEditor.ts).
 */
export function ctaIndexAny(n: number): number {
  return Math.min(Math.max(1, Math.ceil(n * 0.6)), Math.max(1, n - 1));
}

/** draft: the empty deck to write, cover, body and the CTA placed anywhere. */
export function draftSkeleton(count: number): InSlide[] {
  const blank = (role: InSlide['role']): InSlide => ({ role, text: '', shot: '', inset_feature_id: null });
  const cta: InSlide = { ...blank('cta'), place: 'any' };
  if (count <= 0) return [blank('cover'), cta];
  const points = Array.from({ length: Math.max(0, count - 1) }, () => blank('point'));
  points.splice(ctaIndexAny(count) - 1, 0, cta);
  return [blank('cover'), ...points];
}

const clean = (t: unknown) => (typeof t === 'string' ? stripDashes(t.replace(/;/g, ',')).trim() : '');
const fromModel = (t: unknown) => clean(typeof t === 'string' ? t.replace(/ \/ /g, '\n') : '');
const forModel = (t: string) => t.replace(/\n+/g, ' / ');

// ---------------------------------------------------------------------------
// Context

// Warm instance cache: brand context and approved examples change rarely, and
// a manager fires several modes in a row. Promises are cached so concurrent
// calls share one load; a failed load is dropped.
const CACHE_TTL = 120_000;
const memo = new Map<string, { at: number; value: Promise<unknown> }>();
function cached<T>(key: string, load: () => Promise<T>, keep: (v: T) => boolean = () => true): Promise<T> {
  const now = Date.now();
  const hit = memo.get(key);
  if (hit && now - hit.at < CACHE_TTL) return hit.value as Promise<T>;
  for (const [k, v] of memo) if (now - v.at >= CACHE_TTL) memo.delete(k);
  const value = load();
  memo.set(key, { at: now, value });
  // Never keep a failed or empty load: the next call reads the DB again.
  const drop = () => {
    if (memo.get(key)?.value === value) memo.delete(key);
  };
  value.then((v) => (keep(v) ? undefined : drop()), drop);
  return value;
}

/**
 * Covers already used: this week's other posts and, when past is wanted, the
 * company's recent ones. Both lookups run in parallel; the week lookup is
 * scoped to the caller's company so another company's titles never leak in.
 */
async function usedCovers(admin: ReturnType<typeof adminClient>, companyId: string, briefId: string | undefined, past: boolean) {
  const weekP = (async () => {
    const week: string[] = [];
    if (!briefId) return week;
    const { data: link } = await admin
      .from('campaign_briefs')
      .select('campaign_id')
      .eq('brief_id', briefId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (!link?.campaign_id) return week;
    const { data: rows } = await admin
      .from('campaign_briefs')
      .select('brief_id, briefs(title)')
      .eq('campaign_id', link.campaign_id)
      .eq('company_id', companyId)
      .neq('brief_id', briefId);
    for (const r of rows ?? []) {
      const t = (r as unknown as { briefs?: { title?: string } | null }).briefs?.title;
      if (t && t !== 'Untitled post' && t !== 'Freestyle') week.push(t);
    }
    return week;
  })();
  const recentP = past
    ? admin.from('briefs').select('title').eq('company_id', companyId).order('created_at', { ascending: false }).limit(60)
    : Promise.resolve({ data: [] as { title: string }[] });
  const [week, { data: recent }] = await Promise.all([weekP, recentP]);
  const titles = (recent ?? [])
    .map((r) => r.title as string)
    .filter((t) => t && t !== 'Untitled post' && t !== 'Freestyle' && !week.includes(t));
  return { week, past: titles };
}

type ExampleRow = { id: string; slides: unknown };

/** The team's own approved posts in this format: the voice to match. Rows cached per company and format. */
async function approvedExamples(admin: ReturnType<typeof adminClient>, companyId: string, format: Format, briefId?: string): Promise<string[]> {
  const all = await cached(`examples:${companyId}:${format}`, async () => {
    const { data, error } = await admin
      .from('briefs')
      .select('id, slides')
      .eq('company_id', companyId)
      .eq('format', format === 'reel' ? 'video' : 'photo_carousel')
      .eq('status', 'ready')
      // Library posts are made, not approved; only week posts teach the voice.
      .is('library_item_id', null)
      .order('reviewed_at', { ascending: false, nullsFirst: false })
      .limit(13);
    if (error) throw new Error(error.message);
    return (data ?? []) as ExampleRow[];
  }, (rows) => rows.length > 0);
  const rows = all
    .filter((r) => r.id !== briefId)
    .slice(0, 12)
    .filter((r) => Array.isArray(r.slides) && (r.slides as unknown[]).length > 2)
    .slice(0, 4);
  if (!rows.length) return [];
  return [
    'POSTS THIS TEAM ALREADY APPROVED in this format. Match their voice and level of detail. Never copy a line and never repeat their topic.',
    ...rows.map((r, n) => {
      const slides = (r.slides as { role?: string; text?: string; shot?: string }[])
        .map((s, i) => `  [${i}] ${s.role ?? ''}: ${forModel(s.text ?? '')}${format === 'reel' && s.shot ? ` (says: ${forModel(s.shot)})` : ''}`)
        .join('\n');
      return `Example ${n + 1}:\n${slides}`;
    }),
  ];
}

/**
 * Brand context per company, cached. loadBrandContext swallows query errors
 * into empty fields, so only a context with its company and some docs or
 * claims is kept.
 */
function brandFor(admin: ReturnType<typeof adminClient>, companyId: string): Promise<BrandContext> {
  const brandP = cached(`brand:${companyId}`, () => loadBrandContext(admin, companyId), (b) =>
    b.companyName !== 'the brand' && (b.approvedClaims.length > 0 || Object.values(b.docs).some((d) => d.trim())));
  // The team's newest feedback rides with the brand, so every mode learns
  // from the last edits right away. A slow or failed read costs the lesson,
  // never the request.
  const feedbackP = within(
    cached(`feedback:${companyId}`, () => teamFeedback(admin, companyId), (rows) => rows.length > 0),
    4_000,
    'Loading feedback',
  ).catch((e) => {
    console.warn('write-deck feedback skipped:', e instanceof Error ? e.message : e);
    return [] as FeedbackRow[];
  });
  return Promise.all([brandP, feedbackP]).then(([brand, rows]) => {
    teamEdits.set(brand, feedbackBlock(rows));
    return brand;
  });
}

/** "How this team edits our AI", per cached brand object. */
const teamEdits = new WeakMap<BrandContext, string>();

/** The company's newest ai_feedback rows (edits, dismissals, revise notes). */
async function teamFeedback(admin: ReturnType<typeof adminClient>, companyId: string): Promise<FeedbackRow[]> {
  const { data, error } = await admin
    .from('ai_feedback')
    .select('kind, surface, format, post_type, role, before, after, note')
    .eq('company_id', companyId)
    .in('kind', ['edit', 'dismiss', 'revise'])
    .order('created_at', { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as FeedbackRow[];
}

/** The shared brand doc blocks plus what this team's edits taught us. Same bytes per company, so it caches. */
function brandDocBlocks(brand: BrandContext): string[] {
  const team = teamEdits.get(brand);
  return team ? [...baseDocBlocks(brand), team] : baseDocBlocks(brand);
}

function featureLines(brand: BrandContext, forced: string | null): string[] {
  const list = forced ? brand.approvedClaims.filter((c) => c.id === forced) : brand.approvedClaims;
  if (!list.length) return [`FEATURES: none listed. The CTA uses only what the Product truth says ${brand.productName} does; feature_id null.`];
  return [
    forced
      ? 'FEATURE FOR THE CTA (the manager picked it; plug this one, feature_id is its id):'
      : 'FEATURES (the CTA plugs the ONE that fits this post best; copy its id into feature_id; ids from any other list are invalid):',
    ...list.slice(0, 30).map((c) => `- id ${c.id}: ${c.name}. ${c.what_it_does}${c.claim ? ` Plug line it can build from: ${c.claim}` : ''}`),
  ];
}

function typeBlock(spec: TypeSpec, postType: PostTypeIn | null, story: boolean, format: Format, productName: string): string {
  return [
    `POST TYPE: ${postType?.name ?? 'Post'}. ${spec.what}`,
    postType?.example ? `Example cover for the shape only, never reuse it: "${postType.example}".` : '',
    `COVER: ${spec.cover}`,
    story ? storyNote(format) : `BODY: ${spec.body}`,
    story || !spec.slideShape ? '' : `SLIDE SHAPE: ${spec.slideShape}`,
    `CTA: ${spec.cta} First person, names ${productName}, says the one real thing it does for this exact problem. ${format === 'reel' ? `The CTA text is the on screen line (4 to 12 words). The CTA shot is what they say: ONE line of 6 to 16 words, a tip with ${productName} in it as the creator's own habit ("I run it through ${productName} first so I never skip that step"). ${CTA_NUDGE} ${CUE_RULE}` : `Written in the same shape and numbering as the slides around it so it reads as one of them, not an ad. ${CTA_NUDGE}`}`,
    format === 'slideshow'
      ? 'PHOTOS: shot on every slide is the photo the creator takes for it, 3 to 8 words. It shows the moment the reader is in or the life they want (laptop open at night, coffee on the desk, phone in hand in the car, the view on a walk), never a literal picture of the advice. Easy to shoot today on a phone, calm enough to read text on top. On the CTA slide a product screenshot sits inset, so its shot is a plain background.'
      : '',
    `WHAT KILLS THIS TYPE: ${spec.kills}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function writableIndexes(mode: Mode, slides: InSlide[], story: boolean, noBody: boolean): Set<number> {
  const out = new Set<number>();
  slides.forEach((s, i) => {
    if ((story || noBody) && s.role === 'point') return;
    const empty = !s.text.trim();
    if (mode === 'cover' && s.role === 'cover') out.add(i);
    else if (mode === 'cta' && s.role === 'cta') out.add(i);
    else if ((mode === 'points' || mode === 'all') && empty) out.add(i);
    else if (mode === 'revise' || mode === 'draft' || mode === 'make') out.add(i);
  });
  return out;
}

function deckLines(slides: InSlide[], writable: Set<number>, format: Format, story = false): string[] {
  let n = 0;
  return slides.map((s, i) => {
    const num = s.role === 'cover' ? '' : ` #${++n}`;
    const tag = writable.has(i) ? 'WRITE' : 'KEEP';
    const creatorPart = story && s.role === 'point' && !s.own && !writable.has(i);
    const text = s.text.trim() ? forModel(s.text) : creatorPart ? "(the creator's own slides go here; never write them)" : '(empty)';
    const shot = s.shot.trim() ? ` | ${format === 'reel' ? 'says' : 'photo'}: ${forModel(s.shot)}` : '';
    return `[${i}] ${s.role}${num} ${tag}: ${text}${shot}`;
  });
}

function merge(parsed: DeckOut, slides: InSlide[], writable: Set<number>, known: Set<string>, forced: string | null): OutSlide[] {
  const byIndex = new Map<number, NonNullable<DeckOut['slides']>[number]>();
  (parsed.slides ?? []).forEach((s, k) => byIndex.set(typeof s.i === 'number' ? s.i : k, s));
  return slides.map((s, i) => {
    const got = byIndex.get(i);
    if (!writable.has(i) || !got) return { text: s.text, shot: s.shot, feature_id: s.inset_feature_id, changed: false };
    const text = fromModel(got.text) || s.text;
    const shot = fromModel(got.shot) || s.shot;
    let featureId = s.inset_feature_id;
    if (s.role === 'cta') {
      const want = forced ?? (typeof got.feature_id === 'string' ? got.feature_id : null);
      featureId = want && known.has(want) ? want : s.inset_feature_id;
    }
    return { text, shot, feature_id: featureId, changed: text !== s.text || shot !== s.shot || featureId !== s.inset_feature_id };
  });
}

// ---------------------------------------------------------------------------
// Deterministic repairs: fixed in code, never sent back to the model.

// "not really" and "isn't actually" carry meaning; the model fixes those.
const HEDGE_ALL = new RegExp(`(?<!\\bnot |n't )${HEDGES.source},?`, 'gi');

function dropHedges(t: string): string {
  if (!HEDGES.test(t)) return t;
  return t
    .split('\n')
    .map((line) => {
      const [, lead, body] = line.match(/^(\s*(?:\d+[.)]\s*)?)([\s\S]*)$/) ?? ['', '', line];
      const rest = body
        .replace(HEDGE_ALL, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+([,.!?])/g, '$1')
        .replace(/^[\s,]+/, '');
      const lower = /^[a-z]/.test(body.trimStart());
      return lead + (lower ? rest : rest.charAt(0).toUpperCase() + rest.slice(1));
    })
    .join('\n');
}

/**
 * Where the CTA sits, from the CTA slide's place (else deck order), as a
 * prompt rule that overrides the type's own CTA placement. Empty when
 * nothing is known about it.
 */
function placementRule(slides: InSlide[], story: boolean, freestyle: boolean, format: Format, productName: string, numbered: boolean): string {
  if (freestyle) return '';
  const at = slides.findIndex((s) => s.role === 'cta');
  if (at < 0) return '';
  const body = slides.filter((s) => s.role !== 'cover').length;
  const unit = format === 'reel' ? 'point' : 'slide';
  const own = format === 'reel' ? "the creator's own clips" : "the creator's own slides";
  const place: CtaPlace | null = slides[at].place ?? (at === 1 && slides.length > 2 ? 'after_hook' : !story && at === slides.length - 1 && body >= 3 ? 'end' : null);
  if (place === 'after_hook') {
    const after = story ? own : `every other ${unit}`;
    return [
      `CTA PLACEMENT: the CTA comes right after the hook, before ${after}. This overrides any rule above about where the CTA lands or that it reads as one of the list items.`,
      `Write it as an opener that sets up what follows: first person, the creator uses ${productName} for this exact problem and says the one real thing it does, then hands off to the rest ("I use ${productName} for this, here's what I'd do", "${productName} handles this part for me, so here's the rest").`,
      'It must make sense before any tip has been given: never refer back to earlier points and never say also, one more, another, last or finally.',
      format === 'reel' ? 'The spoken line (shot) is one short line that plugs it as a tip, then the story or the list takes over.' : '',
      numbered && !story ? 'It carries number 1, and the slides after it count on from 2.' : '',
    ]
      .filter(Boolean)
      .join(' ');
  }
  if (place === 'end') {
    return story
      ? `CTA PLACEMENT: the CTA closes the post, after ${own}. Write it as the pay off of the story, then the nudge. Never set up anything that comes after it.`
      : `CTA PLACEMENT: the CTA is the last body ${unit} and closes the post. Write it as the final step or tip that pays the post off, then the nudge. Never set up points that come after it.`;
  }
  if (place === 'any') {
    return [
      `CTA PLACEMENT: each creator decides where the CTA lands in their ${format === 'reel' ? 'reel' : 'post'}, so it has to work anywhere: right after the hook, between any two ${story ? 'parts' : `${unit}s`}, or at the end. This overrides any rule above about where the CTA lands.`,
      `Write it so it stands alone: one short tip in first person about what ${productName} does for this exact problem.`,
      'Never refer back or forward to other points: no as I said, like I said, also, one more, another, next, last, finally or so.',
      numbered && !story ? 'Its only number is the one its slot carries now; nothing else in it depends on its position.' : '',
    ]
      .filter(Boolean)
      .join(' ');
  }
  return '';
}


/** The slide's own number leads it, replacing whatever number the model wrote. */
const renumber = (t: string, n: number) => `${n}. ${t.replace(/^\s*\d+\s*[.)]\s*/, '').trimStart()}`;

/**
 * A length miss within a word or two of the range: not worth a second call.
 * Short ranges (cues, labels, photo lines) get one word of slack, so a long
 * cue never ships.
 */
export function nearMiss(fail: string): boolean {
  const m = fail.match(/(text|shot) is (\d+) words; it must be (\d+) to (\d+)/);
  if (!m) return false;
  const [n, min, max] = [Number(m[2]), Number(m[3]), Number(m[4])];
  const slack = max <= 16 ? 1 : 2;
  return n >= min - slack && n <= max + slack;
}


// ---------------------------------------------------------------------------
// chat

const PLACEHOLDER_TITLES = new Set(['Untitled post', 'Freestyle', '']);

type SlotRow = {
  brief_id: string;
  briefs: { format?: string; title?: string | null; kind?: string | null; status?: string | null; archived_at?: string | null; post_types?: { label?: string } | null } | null;
};

/** The company's newest 30 dismissed ideas. The table is newer than the generated types. */
async function teamDismissals(admin: ReturnType<typeof adminClient>, companyId: string): Promise<DismissRow[]> {
  const table = admin.from('ai_feedback' as never) as unknown as {
    select: (cols: string) => {
      eq: (c: string, v: string) => {
        eq: (c: string, v: string) => {
          order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => PromiseLike<{ data: DismissRow[] | null; error: { message: string } | null }> };
        };
      };
    };
  };
  const { data, error } = await table.select('before, format, post_type').eq('company_id', companyId).eq('kind', 'dismiss').order('created_at', { ascending: false }).limit(30);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** The idea chat: one fast call, no repair pass, no approved examples. */
async function chatReply(admin: ReturnType<typeof adminClient>, companyId: string, body: Body): Promise<Response> {
  const campaignId = typeof body.campaign_id === 'string' ? body.campaign_id : '';
  if (!campaignId) return jsonResponse({ error: 'campaign_id required' }, 400);
  const turns = chatTurns(body.messages);
  if (!turns.some((t) => t.role === 'user')) return jsonResponse({ error: 'Say what you need first.' }, 400);
  const hint: Format | null = body.format_hint === 'reel' || body.format_hint === 'slideshow' ? body.format_hint : null;
  const shown = (Array.isArray(body.shown) ? body.shown : []).filter((t): t is string => typeof t === 'string' && Boolean(t.trim())).slice(-40);
  // Ideas the manager tapped X on in this chat.
  const rejected = chatRejected((body as { rejected?: unknown }).rejected);

  const [brand, slotsRes, used, dismissed] = await Promise.all([
    within(brandFor(admin, companyId), LOOKUP_MS, 'Loading the brand'),
    // Scoped to the caller's company, so another company's week reads empty.
    within(
      Promise.resolve(
        admin
          .from('campaign_briefs')
          .select('brief_id, briefs(format, title, kind, status, archived_at, post_types(label))')
          .eq('campaign_id', campaignId)
          .eq('company_id', companyId),
      ),
      LOOKUP_MS,
      'Loading this week',
    ),
    within(usedCovers(admin, companyId, undefined, true), LOOKUP_MS, 'Loading recent posts').catch(() => ({ week: [] as string[], past: [] as string[] })),
    within(teamDismissals(admin, companyId), LOOKUP_MS, 'Loading rejected ideas').catch((e) => {
      console.warn('write-deck chat dismissals skipped:', e instanceof Error ? e.message : e);
      return [] as DismissRow[];
    }),
  ]);
  if (slotsRes.error) throw new Error(slotsRes.error.message);

  const slots = ((slotsRes.data ?? []) as unknown as SlotRow[]).filter((r) => r.briefs && !r.briefs.archived_at);
  const lane = (f: Format) => slots.filter((r) => (r.briefs!.format === 'photo_carousel' ? 'slideshow' : 'reel') === f);
  const empty = (f: Format) => lane(f).filter((r) => !r.briefs!.kind).length;
  const inWeek = slots
    .filter((r) => r.briefs!.kind && !PLACEHOLDER_TITLES.has((r.briefs!.title ?? '').trim()))
    .map((r) => ({
      format: (r.briefs!.format === 'photo_carousel' ? 'slideshow' : 'reel') as Format,
      title: (r.briefs!.title ?? '').trim(),
      type: r.briefs!.post_types?.label ?? '',
    }));
  const weekTitles = inWeek.map((w) => w.title);
  const past = used.past.filter((t) => !weekTitles.includes(t));

  const productName = brand.productName;
  const reelVoice = VOICE_RULES(productName, 'reel', brandAudience(brand)).split('\n').find((l) => l.startsWith('REEL CUES')) ?? '';
  // Same bytes every turn for this company, so the system prompt caches too.
  const system = [
    `You pitch short form post ideas (TikTok and Instagram slideshows and reels) that creators post from their own accounts for ${brand.companyName}. Everything you pitch gets made into a real post by real creators from this audience, so it has to sound like them.`,
    chatTypesBlock(),
    VOICE_RULES(productName, 'slideshow', brandAudience(brand)),
    reelVoice ? `For reels: ${reelVoice}` : '',
    ...featureLines(brand, null),
    brand.bannedPhrases.length ? `BANNED PHRASES from this team (never use): ${brand.bannedPhrases.join(' | ')}` : '',
    chatTask(productName),
  ]
    .filter(Boolean)
    .join('\n\n');

  const slotLine = (f: Format, label: string) => `${label}: ${empty(f)} of ${lane(f).length} slots empty`;
  const user = [
    slots.length ? `THIS WEEK: ${slotLine('slideshow', 'Slideshows')}. ${slotLine('reel', 'Reels')}.` : 'THIS WEEK: no slots planned yet.',
    hint ? `The manager opened this chat from an empty ${hint} slot, so lean to ${hint} ideas unless they ask for something else.` : '',
    inWeek.length
      ? `ALREADY IN THIS WEEK (never pitch these topics again):\n${inWeek.map((w) => `- [${w.format}${w.type ? `, ${w.type}` : ''}] ${w.title}`).join('\n')}`
      : '',
    past.length ? `POSTED RECENTLY (do not repeat these topics):\n${past.slice(0, 40).map((t) => `- ${t}`).join('\n')}` : '',
    shown.length ? `ALREADY PITCHED IN THIS CHAT (never pitch these again):\n${shown.map((t) => `- ${t}`).join('\n')}` : '',
    rejectedBlock(rejected, dismissed),
    `THE CHAT SO FAR (oldest first):\n${transcript(turns)}`,
    "Answer the manager's last message with the JSON object.",
  ].filter(Boolean);

  const cachedPrefix = [`${brandDocBlocks(brand).join('\n\n')}\n\n${PLATFORM_RULES}`];
  // The client gives up at 45s; never hold the call longer than that.
  const ask = (extra: string[]) => askClaude(system, [...user, ...extra].join('\n\n'), 1800, { cachedPrefix, prefixInSystem: true, timeoutMs: 45_000 });
  const parsed = await ask([])
    .then((raw) => parseClaudeJson<ChatRaw>(raw))
    .catch((e) => {
      console.warn('write-deck chat first pass failed:', e instanceof Error ? e.message : e);
      return ask(['Your last answer was not valid JSON. Answer with the JSON object only.']).then((raw) => parseClaudeJson<ChatRaw>(raw));
    });
  const out = normalizeChat(parsed, {
    taken: [...weekTitles, ...past, ...shown, ...rejected, ...dismissed.map((d) => d.before ?? '').filter(Boolean)],
    banned: brand.bannedPhrases,
    clean,
    fromModel,
  });
  return jsonResponse(out);
}

// ---------------------------------------------------------------------------
// make

/** A request the caller can fix (bad input, a reference not read yet). */
class MakeInputError extends Error {}

type Prepared = {
  made: Made;
  parsed: MakeRaw;
  source: MakeSource | null;
  direction: string;
  idea: string;
};

/** The reference's stored study, or a clear reason it cannot be remixed yet. */
async function makeSourceFor(admin: ReturnType<typeof adminClient>, companyId: string, body: Body): Promise<MakeSource | null> {
  const id = typeof body.reference_id === 'string' ? body.reference_id.trim() : '';
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!id && !url) return null;
  const study = await within(id ? loadStudyById(admin, companyId, id) : loadStudy(admin, companyId, url), LOOKUP_MS, 'Loading the reference');
  if (!study) throw new MakeInputError('This post has not been read yet. Paste it again.');
  if (study.status === 'pending') throw new MakeInputError('Still reading this post. Try again in a moment.');
  const slideTexts = Array.isArray(study.slide_texts) ? study.slide_texts.filter((t): t is string => typeof t === 'string') : [];
  if (study.status !== 'done' && !study.transcript?.trim() && !slideTexts.some((t) => t.trim())) {
    throw new MakeInputError(study.error || 'Could not read this post. Try another link.');
  }
  return {
    url: study.url,
    format: study.format === 'photo_carousel' ? 'slideshow' : 'reel',
    platform: study.platform === 'tiktok' ? 'TikTok' : study.platform === 'instagram' ? 'Instagram' : null,
    caption: study.caption,
    transcript: study.transcript,
    slideTexts,
    pattern: study.pattern ? patternLines(study.pattern as PatternCard) : null,
  };
}

/**
 * The one writing call of make mode: the model picks the format and post type
 * when they are open and writes the whole deck. The caller runs the checks
 * and the targeted repair on what comes back.
 */
async function prepareMake(
  admin: ReturnType<typeof adminClient>,
  companyId: string,
  body: Body,
  timeoutMs: () => number,
): Promise<Prepared> {
  // The idea chat sends its card: the cover, hook and outline are the post.
  const pinned = readMakeIdea(body as Record<string, unknown>, clean);
  const idea = typeof body.idea === 'string' ? clean(body.idea).slice(0, 600) : pinned?.cover ?? '';
  const direction = typeof body.direction === 'string' ? clean(body.direction).slice(0, 600) : '';
  const [brand, source] = await Promise.all([within(brandFor(admin, companyId), LOOKUP_MS, 'Loading the brand'), makeSourceFor(admin, companyId, body)]);
  if (!source && !idea) throw new MakeInputError('Type a post idea or paste a link.');
  const remix = source !== null;
  // A reference keeps its own format; otherwise the manager's pick, else the model's.
  const pinnedFormat: Format | null = source?.format ?? (body.format === 'reel' || body.format === 'slideshow' ? body.format : null);
  // The Library sends the type id as a plain string; the editor sends the object.
  const rawType: unknown = body.post_type;
  const wantType =
    typeof rawType === 'string' ? rawType : rawType && typeof rawType === 'object' ? String((rawType as { id?: unknown }).id ?? '') : null;
  const pinnedType = pinnedFormat && wantType && makeTypes(pinnedFormat).some((t) => t.id === wantType) ? wantType : null;
  const formats: Format[] = pinnedFormat ? [pinnedFormat] : ['slideshow', 'reel'];
  const examples = pinnedFormat
    ? await within(approvedExamples(admin, companyId, pinnedFormat), LOOKUP_MS, 'Loading examples').catch(() => [] as string[])
    : [];
  const productName = brand.productName;
  const reelCues = VOICE_RULES(productName, 'reel', brandAudience(brand)).split('\n').find((l) => l.startsWith('REEL CUES')) ?? '';
  const avoid = (Array.isArray(body.avoid) ? body.avoid : []).filter((t): t is string => typeof t === 'string' && Boolean(t.trim())).slice(-6);

  const system = [
    `You write short form posts (TikTok and Instagram slideshows and reels) that creators post from their own accounts for ${brand.companyName}. A campaign manager gave you ${remix ? 'a reference post that won in another niche to remix for us' : 'a post idea'}. Write the best possible UGC post for this company: everything you write gets posted by real creators from this audience, so it has to sound like them.`,
    makeTypesBlock(formats, pinnedType),
    VOICE_RULES(productName, pinnedFormat ?? 'slideshow', brandAudience(brand)),
    !pinnedFormat && reelCues ? `For reels: ${reelCues}` : '',
    DETAILS_RULES(productName),
    `CTA: exactly one cta slide, first person, names ${productName}, says the one real thing it does for this exact problem. ${CTA_NUDGE}`,
    remix
      ? remixRules(productName, source.format, direction)
      : pinned && pinnedFormat && pinnedType
        ? pinnedIdeaRules(productName, pinned, pinnedFormat)
        : ideaRules(productName, idea, direction, !pinnedFormat, !pinnedType),
    makeAnswer(pinnedFormat),
  ]
    .filter(Boolean)
    .join('\n\n');
  const user = [
    ...featureLines(brand, null),
    brand.bannedPhrases.length ? `BANNED PHRASES from this team (never use): ${brand.bannedPhrases.join(' | ')}` : '',
    avoid.length ? `YOU ALREADY WROTE THESE COVERS FOR THIS (write a fresh take: a different cover and different slides on the same topic):\n${avoid.map((t) => `- ${t}`).join('\n')}` : '',
    source ? sourceBlock(source) : '',
    remix ? 'Write our version of this post now.' : 'Write the post now.',
  ].filter(Boolean);
  const cachedPrefix = [`${brandDocBlocks(brand).join('\n\n')}\n\n${PLATFORM_RULES}`, examples.join('\n\n')];
  const ask = (extra: string[]) =>
    askClaude(system, [...user, ...extra].join('\n\n'), 3600, { cachedPrefix, prefixInSystem: true, timeoutMs: Math.max(1000, timeoutMs()) });
  const parsed = await ask([])
    .then((raw) => parseClaudeJson<MakeRaw>(raw))
    .catch((e) => {
      console.warn('write-deck make first pass failed:', e instanceof Error ? e.message : e);
      if (tooLong(e) || timeoutMs() < 40_000) throw e;
      return ask(['Your last answer was not valid JSON. Answer with the JSON object only.']).then((raw) => parseClaudeJson<MakeRaw>(raw));
    });
  const made = normalizeMade(parsed, {
    format: pinnedFormat,
    typeId: pinnedType,
    remix,
    known: new Set(brand.approvedClaims.map((c) => c.id)),
    fromModel,
    clean,
    pinned: !remix && pinnedFormat && pinnedType ? pinned : null,
  });
  return { made, parsed, source, direction, idea };
}

/** The format and post type a short make asks for, or null when it is not one. */
function shortMakeOf(body: Body): { format: Format; typeId: string } | null {
  const format: Format | null = body.format === 'reel' || body.format === 'slideshow' ? body.format : null;
  const rawType: unknown = body.post_type;
  const typeId = typeof rawType === 'string' ? rawType : rawType && typeof rawType === 'object' ? String((rawType as { id?: unknown }).id ?? '') : '';
  if (!format || !typeId || !isShortMake(body.kind, format, typeId)) return null;
  return { format, typeId };
}

/**
 * Story and Long text from an idea chat card: the cover is fixed, so one
 * call writes the hook (or on camera action), the CTA and the details.
 */
async function makeShort(admin: ReturnType<typeof adminClient>, companyId: string, body: Body, at: { format: Format; typeId: string }): Promise<Response> {
  const idea = readMakeIdea(body as Record<string, unknown>, clean);
  if (!idea) throw new MakeInputError('Pick an idea first.');
  const { format, typeId } = at;
  const kind = body.kind === 'story' && typeId !== 'longtext' ? 'story' : 'handheld';
  const brand = await within(brandFor(admin, companyId), LOOKUP_MS, 'Loading the brand');
  const productName = brand.productName;
  const system = [
    `You write short form posts (TikTok and Instagram slideshows and reels) that creators post from their own accounts for ${brand.companyName}. A campaign manager picked this post in the idea chat; you finish it. Everything you write gets posted by real creators from this audience, so it has to sound like them.`,
    VOICE_RULES(productName, format, brandAudience(brand)),
    DETAILS_RULES(productName),
    shortRules(productName, format, typeId, kind, idea),
  ].join('\n\n');
  const user = [
    ...featureLines(brand, null),
    brand.bannedPhrases.length ? `BANNED PHRASES from this team (never use): ${brand.bannedPhrases.join(' | ')}` : '',
    'Write it now.',
  ].filter(Boolean);
  const cachedPrefix = [`${brandDocBlocks(brand).join('\n\n')}\n\n${PLATFORM_RULES}`];
  const ask = (extra: string[]) => askClaude(system, [...user, ...extra].join('\n\n'), 1200, { cachedPrefix, prefixInSystem: true, timeoutMs: 45_000 });
  const parsed = await ask([])
    .then((raw) => parseClaudeJson<ShortRaw>(raw))
    .catch((e) => {
      console.warn('write-deck short make first pass failed:', e instanceof Error ? e.message : e);
      if (tooLong(e)) throw e;
      return ask(['Your last answer was not valid JSON. Answer with the JSON object only.']).then((raw) => parseClaudeJson<ShortRaw>(raw));
    });
  const made = normalizeShort(parsed, {
    format,
    typeId,
    kind,
    idea,
    productName,
    known: new Set(brand.approvedClaims.map((c) => c.id)),
    fromModel,
    clean,
  });
  return jsonResponse({ ...made, slides: made.slides.map((x) => ({ ...x, text: dropHedges(x.text), shot: dropHedges(x.shot) })) });
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  const admin = adminClient();
  const caller = await within(authenticate(req, admin), LOOKUP_MS, 'Sign in check').catch(() => null);
  if (!caller || caller.kind !== 'user') return jsonResponse({ error: 'unauthorized' }, 401);
  const manager = caller.role === 'campaign_manager';
  if (!manager && caller.role !== 'creator') return jsonResponse({ error: 'forbidden' }, 403);
  if (!caller.companyId) return jsonResponse({ error: 'no active company' }, 400);

  const body = ((await req.json().catch(() => null)) ?? {}) as Body;
  // Creators get help on their own slides only; reviews and the manager's
  // slides stay with the manager.
  if (!manager && (body.mode === 'review' || body.mode === 'chat' || body.mode === 'draft' || body.mode === 'make')) return jsonResponse({ error: 'forbidden' }, 403);
  if (body.mode === 'chat') {
    try {
      return await chatReply(admin, caller.companyId, body);
    } catch (error) {
      console.error('write-deck chat failed:', error);
      return jsonResponse({ error: tooLong(error) ? 'The AI took too long. Try again.' : error instanceof Error ? error.message : 'Idea chat failed. Try again.' }, 500);
    }
  }
  const startedAt = Date.now();
  const making = body.mode === 'make';
  const budgetMs = making ? MAKE_BUDGET_MS : DRAFT_BUDGET_MS;
  // make: one writing call picks the format and type and writes the deck;
  // everything after it (checks, repair) is the draft path.
  let prepared: Prepared | null = null;
  // Story and Long text cards: cover and CTA only, one short call.
  const short = making ? shortMakeOf(body) : null;
  if (short) {
    try {
      return await makeShort(admin, caller.companyId, body, short);
    } catch (error) {
      console.error('write-deck short make failed:', error);
      if (error instanceof MakeInputError) return jsonResponse({ error: error.message }, 409);
      return jsonResponse({ error: tooLong(error) ? 'The AI took too long. Try again.' : error instanceof Error ? error.message : 'Could not make the post. Try again.' }, 500);
    }
  }
  if (making) {
    try {
      prepared = await prepareMake(admin, caller.companyId, body, () => budgetMs - (Date.now() - startedAt) - 20_000);
    } catch (error) {
      console.error('write-deck make failed:', error);
      if (error instanceof MakeInputError) return jsonResponse({ error: error.message }, 409);
      return jsonResponse({ error: tooLong(error) ? 'The AI took too long. Try again.' : error instanceof Error ? error.message : 'Could not make the post. Try again.' }, 500);
    }
    body.format = prepared.made.format;
    body.post_type = { id: prepared.made.typeId, name: prepared.made.typeName };
    body.feature_id = null;
    body.caption = undefined;
    body.hashtags = undefined;
    body.search_phrase = undefined;
  }
  const format: Format = body.format === 'reel' ? 'reel' : 'slideshow';
  const mode: Mode = body.mode ?? 'all';
  const drafting = mode === 'draft' || making;
  // A draft is always a Handheld post the model writes end to end.
  if (drafting) body.kind = 'handheld';
  const story = body.kind === 'story';
  const draftSpec = drafting && !prepared ? specFor(format, body.post_type?.id) : null;
  const draftCount = draftSpec
    ? draftSpec.count === 0
      ? 0
      : Math.max(2, Math.min(10, Math.round(Number(body.count) || draftSpec.count)))
    : 0;
  const slides: InSlide[] = prepared
    ? prepared.made.skeleton
    : drafting
    ? draftSkeleton(draftCount)
    : Array.isArray(body.slides)
    ? body.slides.map((s) => ({
        role: s.role === 'cover' || s.role === 'cta' ? s.role : 'point',
        text: typeof s.text === 'string' ? s.text : '',
        shot: typeof s.shot === 'string' ? s.shot : '',
        inset_feature_id: typeof s.inset_feature_id === 'string' ? s.inset_feature_id : null,
        own: s.own === true,
        ...(s.role === 'cta' && (s.place === 'after_hook' || s.place === 'end' || s.place === 'any') ? { place: s.place } : {}),
      }))
    : [];
  const freestyle = body.kind === 'open';
  if (!slides.length && mode !== 'ideas') return jsonResponse({ error: 'slides required' }, 400);
  if (mode === 'revise' && !body.feedback?.trim()) return jsonResponse({ error: 'feedback required' }, 400);

  // Only ideas and draft read past covers; cover, points and all read this
  // week's; cta, details, revise and review read neither. Examples feed the
  // modes that write voice from scratch.
  // make writes the manager's own topic, so no cover is taken.
  const usesWeek = mode === 'ideas' || mode === 'cover' || mode === 'points' || mode === 'all' || (drafting && !making);
  const usesExamples = mode === 'ideas' || mode === 'cover' || mode === 'points' || mode === 'all' || mode === 'revise' || drafting;
  const companyId = caller.companyId;

  try {
    // Covers and examples are context: a slow lookup costs the hint, not the request.
    const [brand, used, examples] = await Promise.all([
      within(brandFor(admin, companyId), LOOKUP_MS, 'Loading the brand'),
      usesWeek
        ? within(usedCovers(admin, companyId, body.brief_id, mode === 'ideas' || mode === 'draft'), LOOKUP_MS, 'Loading this week').catch((e) => {
            console.warn('write-deck used covers skipped:', e instanceof Error ? e.message : e);
            return { week: [] as string[], past: [] as string[] };
          })
        : { week: [] as string[], past: [] as string[] },
      usesExamples
        ? within(approvedExamples(admin, companyId, format, body.brief_id), LOOKUP_MS, 'Loading examples').catch((e) => {
            console.warn('write-deck examples skipped:', e instanceof Error ? e.message : e);
            return [] as string[];
          })
        : ([] as string[]),
    ]);
    const productName = brand.productName;
    // "In my bio" is an ad read unless the brand docs' CTA mechanic is the bio.
    const bioOk = /\b(in|link in|my) bio\b/i.test(Object.values(brand.docs).join('\n'));
    const postType = body.post_type ?? null;
    const spec = specFor(format, postType?.id);
    const baseShape = story ? storyShape(format, spec.shape) : spec.shape;
    // Creators write text only; photos and takes are theirs.
    // A remix keeps the source's pacing, so short slides pass.
    const remixShape = prepared?.source ? { ...baseShape, pointText: [2, baseShape.pointText[1]] as [number, number], ctaText: [4, baseShape.ctaText[1]] as [number, number] } : baseShape;
    const shape = manager
      ? remixShape
      : { ...baseShape, coverShot: null, pointShot: null, ctaShot: null, pointText: format === 'reel' ? ([2, 16] as [number, number]) : baseShape.pointText };
    const noBody = spec.count === 0;
    // Cached system prefix, same bytes for every mode: brand docs and platform
    // rules per company, then the approved examples per company and format.
    const cachedPrefix = [`${brandDocBlocks(brand).join('\n\n')}\n\n${PLATFORM_RULES}`, examples.join('\n\n')];
    // Every call is bounded: a draft by what is left of its budget, the
    // editor modes by CALL_MS.
    const left = () => budgetMs - (Date.now() - startedAt);
    const ask = (system: string, user: string[], max = 3000) =>
      askClaude(system, user.join('\n\n'), max, {
        cachedPrefix,
        prefixInSystem: true,
        timeoutMs: drafting ? Math.max(1000, left()) : CALL_MS,
      });
    const writerIntro = manager
      ? `You write short form posts (TikTok and Instagram slideshows and reels) that creators post from their own accounts for ${brand.companyName}. A campaign manager is building one post in an editor and asked you for help. Everything you write gets posted by real creators from this audience, so it has to sound like them.`
      : `You help a creator who posts for ${brand.companyName} from their own account write their own ${format === 'reel' ? 'reel' : 'slideshow'}. The manager's slides are fixed; you write only the creator's own slides, in the creator's first person voice. Never invent facts about their life (where they work or study, results, numbers); when a line needs their own detail, keep it general or leave one short [bracket] for them to fill.`;
    const placement = placementRule(slides, story, freestyle, format, productName, spec.numbered);
    const makeNote = prepared
      ? prepared.source
        ? [
            `THIS IS A REMIX of a reference post: keep its structure, list shape, pacing and CTA spot, never its sentences.${prepared.direction ? ` The topic: ${prepared.direction}.` : ''}`,
            prepared.made.sourceNote ? `What was kept: ${prepared.made.sourceNote}` : '',
          ].filter(Boolean).join(' ')
        : `THE MANAGER'S IDEA (the topic and intent): ${prepared.idea}${prepared.direction ? `. Direction: ${prepared.direction}` : ''}`
      : '';
    const typeText = freestyle
      ? `FREESTYLE POST: the creator decides the topic and structure. Keep it to one clear idea, a cover that stops the scroll, and slides that each carry one concrete detail. ${slides.some((s) => s.role === 'cta') ? '' : `Mention ${productName} at most once, inside one slide, only if it fits naturally.`}`
      : [typeBlock(spec, postType, story, format, productName), placement, makeNote].filter(Boolean).join('\n');
    const banned = brand.bannedPhrases.length ? [`BANNED PHRASES from this team (never use): ${brand.bannedPhrases.join(' | ')}`] : [];

    // ----- ideas -------------------------------------------------------------
    if (mode === 'ideas') {
      const bodyCount = noBody || story ? 0 : spec.count;
      const shown = (Array.isArray(body.exclude) ? body.exclude : []).filter((t): t is string => typeof t === 'string' && Boolean(t.trim())).slice(-40);
      const system = [
        writerIntro,
        typeText,
        VOICE_RULES(productName, format, brandAudience(brand)),
        `TASK: pitch 8 different covers for this post type, best first. Each one is a post a strict campaign manager would approve on sight: a real problem this audience has this month, narrow enough to deliver in ${bodyCount ? `${bodyCount} slides` : 'one post'}, something someone in this audience would save or send to a friend, and close enough to a ${productName} feature that the CTA lands naturally. Spread them across different problems and moments in the audience's year; no two ideas about the same thing.`,
        `ANSWER with one JSON object and nothing else: {"ideas": [{"cover": string, "say": string, "count": number, "angle": string}]}. cover follows the COVER rule above. ${format === 'reel' ? 'say is the spoken hook, one punchy line of 5 to 12 words.' : 'say is an empty string.'} count is how many body slides (the CTA included) this idea needs, ${noBody || story ? '0' : 'within 3 to 8'}; when the cover names a number, count is that number. angle is one plain sentence to the manager on why this post earns saves or sends, naming the concrete detail it hinges on.`,
      ].join('\n\n');
      const user = [
        ...featureLines(brand, null),
        used.week.length ? `ALREADY IN THIS WEEK (never pitch these topics again):\n${used.week.map((t) => `- ${t}`).join('\n')}` : '',
        used.past.length ? `POSTED RECENTLY (do not repeat these topics):\n${used.past.slice(0, 40).map((t) => `- ${t}`).join('\n')}` : '',
        shown.length ? `ALREADY SHOWN TO THE MANAGER (pitch different ones):\n${shown.map((t) => `- ${t}`).join('\n')}` : '',
        ...banned,
        slides.some((s) => s.text.trim()) ? `THE POST SO FAR (the covers must fit it):\n${deckLines(slides, new Set(), format).join('\n')}` : '',
        'Pitch 8 covers.',
      ].filter(Boolean);
      const parsed = parseClaudeJson<{ ideas?: IdeaOut[] }>(await ask(system, user, 2600));
      const taken = [...used.week, ...used.past, ...shown];
      const [cmin, cmax] = shape.coverText;
      const ideas = (parsed.ideas ?? [])
        .map((d) => ({
          cover: fromModel(d.cover),
          say: format === 'reel' ? fromModel(d.say) : '',
          count: noBody || story ? 0 : Math.max(3, Math.min(8, Math.round(Number(d.count) || spec.count))),
          angle: clean(d.angle),
        }))
        .filter((d) => d.cover && words(d.cover) >= cmin && words(d.cover) <= cmax + 2)
        .filter((d) => !slopHits(`${d.cover} ${d.say}`).length && !d.cover.includes(':'))
        .filter((d) => !taken.some((t) => overlap(t, d.cover) > 0.75))
        .filter((d, k, all) => !all.slice(0, k).some((o) => overlap(o.cover, d.cover) > 0.75))
        .slice(0, 6)
        .map((d) => {
          // A number on the cover is the count.
          const m = d.cover.match(/^\s*(\d{1,2})\b/);
          return m && d.count ? { ...d, count: Math.max(3, Math.min(10, Number(m[1]))) } : d;
        });
      return jsonResponse({ ideas });
    }

    // ----- review -------------------------------------------------------------
    if (mode === 'review') {
      const system = [
        `You are the strictest campaign manager on a UGC team for ${brand.companyName}. You read a finished post the way its target viewer will meet it on their feed, and you decide if it ships. You are hard to impress and allergic to anything that sounds generated.`,
        typeText,
        VOICE_RULES(productName, format, brandAudience(brand)),
        'TASK: score the post 0 to 100 for how well it will do with this audience (scroll stop on the cover, specificity of every slide, sounds like a real person in this audience, the CTA feels like a tip, worth saving). Then give the fixes that would raise it most, at most 4, worst first. A fix names the slide index, the problem in a few plain words, and the ready to use replacement: the full new text (and shot when that changes too) written to every rule above. Only fix what is wrong; a post with no real problems gets an empty fixes list. Never suggest a fix that breaks the slide shape or numbering. Long is a problem: a cue over one line, a slide over one short sentence, a setup line ("Here is why", "the real problem") or an ad read gets a shorter fix.',
        'ANSWER with one JSON object and nothing else: {"score": number, "verdict": string, "fixes": [{"i": number, "problem": string, "text": string, "shot": string}]}. verdict is one plain sentence to the manager. Put a line break inside text as " / ".',
      ].join('\n\n');
      const user = [
        ...featureLines(brand, slides.find((s) => s.role === 'cta')?.inset_feature_id ?? null),
        `THE POST (${slides.length} slides):`,
        ...deckLines(slides, new Set(), format, story).map((l) => l.replace(' KEEP:', ':')),
        `Caption: ${body.caption || '(none)'} | hashtags: ${(body.hashtags ?? []).join(' ') || '(none)'} | search phrase: ${body.search_phrase || '(none)'}`,
        ...banned,
      ];
      const parsed = parseClaudeJson<ReviewOut>(await ask(system, user, 2000));
      // Deterministic findings the model may have missed ride along.
      const auto = checkDeck({
        out: slides.map((s) => ({ text: s.text, shot: s.shot, feature_id: s.inset_feature_id, changed: true })),
        slides,
        writable: new Set(slides.map((_, i) => i).filter((i) => !(story && slides[i].role === 'point'))),
        shape,
        productName,
        banned: brand.bannedPhrases,
        numbered: spec.numbered && !story,
        details: null,
        format,
        allowBio: bioOk,
      }).filter((f) => !/is \d+ words/.test(f));
      const fixes = (parsed.fixes ?? [])
        .filter((f) => typeof f.i === 'number' && f.i >= 0 && f.i < slides.length && fromModel(f.text))
        // The creator's part of a Story is not the manager's to fix.
        .filter((f) => !(story && slides[f.i as number].role === 'point' && !slides[f.i as number].text.trim()))
        .slice(0, 4)
        .map((f) => ({ i: f.i as number, problem: clean(f.problem), text: fromModel(f.text), shot: fromModel(f.shot) || slides[f.i as number].shot }))
        .filter((f) => !slopHits(`${f.text} ${f.shot}`).length);
      return jsonResponse({
        score: Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0))),
        verdict: clean(parsed.verdict),
        fixes,
        flags: auto,
      });
    }

    // ----- write modes --------------------------------------------------------
    const only = Array.isArray(body.only) ? body.only.filter((i) => Number.isInteger(i) && i >= 0 && i < slides.length) : null;
    const writable = only ? new Set(only) : writableIndexes(mode, slides, story, noBody);
    if (!manager) for (const i of [...writable]) if (!slides[i].own) writable.delete(i);
    if (!writable.size && mode !== 'details') return jsonResponse({ error: 'nothing to write' }, 400);
    const wantDetails = mode === 'details' || (manager && (mode === 'all' || mode === 'revise' || drafting));
    // draft: covers that are taken, so the post picks a fresh topic.
    const avoid = (Array.isArray(body.avoid) ? body.avoid : []).filter((t): t is string => typeof t === 'string' && Boolean(t.trim())).slice(-40);
    const takenCovers = drafting && !making ? [...new Set([...used.week, ...avoid, ...used.past.slice(0, 40)])] : [];
    const known = new Set(brand.approvedClaims.map((c) => c.id));
    // The manager's pick wins; otherwise the CTA keeps the feature it already
    // has (cta mode included), and only an empty CTA lets the model choose.
    const ctaInset = slides.find((s) => s.role === 'cta')?.inset_feature_id ?? null;
    const wantFeature = body.feature_id ?? ctaInset;
    const forced = wantFeature && known.has(wantFeature) ? wantFeature : null;
    // Reel "Draft" on the spoken hook: the manager's title card stays.
    const keepTitle = mode === 'cover' && format === 'reel' && Boolean(slides[0]?.text.trim());

    const systemFor = (details: boolean, every: boolean) =>
      [
        writerIntro,
        typeText,
        manager ? VOICE_RULES(productName, format, brandAudience(brand)) : VOICE_RULES(productName, 'reel', brandAudience(brand)).replace(/REEL CUES ARE SPOKEN[^\n]*/, 'THIS IS THE CREATOR\'S OWN POST: first person, their voice, never an invented fact about their life.'),
        DETAILS_RULES(productName),
        `ANSWER with one JSON object and nothing else: {"note": string, "slides": [{"i": number, "text": string, "shot": string, "feature_id": string | null}], "caption": string, "hashtags": string[], "search_phrase": string}. "slides" holds ONLY the slides tagged WRITE, each with its index i${every ? ' (return every slide; the ones the feedback is not about come back unchanged)' : ''}. Put a line break inside text as " / ". note is one plain sentence to the manager about what you wrote and why it works. ${details ? 'Fill caption, hashtags and search_phrase.' : 'caption, hashtags and search_phrase are empty values.'}`,
      ].join('\n\n');

    /** Everything the model knows about the deck, with w as the WRITE set. */
    const deckContext = (deck: InSlide[], w: Set<number>, revising: boolean) => {
      const cover = deck[0]?.text.trim() ?? '';
      return [
        ...featureLines(brand, forced),
        drafting && takenCovers.length
          ? `COVERS ALREADY TAKEN (in this week, drafted for it just now, or posted recently). Never reuse their topic or their angle:\n${takenCovers.map((t) => `- ${t}`).join('\n')}`
          : used.week.length
            ? `OTHER POSTS THIS WEEK (do not overlap their points):\n${used.week.map((t) => `- ${t}`).join('\n')}`
            : '',
        `THE DECK in order (${deck.length} slides). WRITE slides are yours. KEEP slides are fixed: build around them, never contradict or repeat them.`,
        ...deckLines(deck, w, format, story),
        cover && !w.has(0) && !revising
          ? `Every slide delivers on the cover "${forModel(cover)}". If the cover names a number, the body has exactly that many slides including the CTA.`
          : '',
        !cover && !w.has(0) ? 'The cover is empty; infer the topic from the other slides.' : '',
        body.caption || body.search_phrase
          ? `Current caption: ${body.caption || '(none)'} | search phrase: ${body.search_phrase || '(none)'} | hashtags: ${(body.hashtags ?? []).join(' ') || '(none)'}`
          : '',
        ...banned,
      ].filter(Boolean);
    };

    const user = deckContext(slides, writable, mode === 'revise');
    const cover = slides[0]?.text.trim() ?? '';
    // The mode's task line; the repair pass repeats it so a fix never drifts
    // from what was asked.
    let task: string;
    if (mode === 'revise') {
      task = `THE MANAGER'S FEEDBACK (it is law; change exactly what it is about and return every other slide word for word): ${body.feedback!.slice(0, 2000)}`;
    } else if (mode === 'cover') {
      task =
        keepTitle
          ? `The manager wrote the title card "${forModel(cover)}". Keep it exactly and write only cover.shot: the hook the creator says first, carrying the same promise out loud.`
          : format === 'reel'
            ? 'Write the cover: the title card text and the spoken hook, so the post the deck builds delivers on it.'
            : 'Write the cover so the slides that follow deliver on it.';
    } else if (mode === 'cta') {
      task = 'Write the CTA slide only, so it reads as part of this deck.';
    } else if (mode === 'details') {
      task = 'Write only the caption, hashtags and search phrase for this deck. slides is an empty array.';
    } else if (drafting) {
      const bodyN = slides.length - 1;
      task = [
        `Write this whole ${postType?.name ?? 'post'} from scratch. First pick its topic: one real problem this audience has this month, specific and narrow, that a strict campaign manager would approve on sight, that someone in this audience would save or send to a friend, and that sits close enough to one feature that the CTA lands naturally. It must not overlap any taken cover.`,
        format === 'reel'
          ? 'Then write the cover (title card text and the spoken hook in shot), every point and the CTA.'
          : 'Then write the cover, every slide and the CTA.',
        draftCount > 0 ? `The post has exactly ${bodyN} body ${format === 'reel' ? 'points' : 'slides'} including the CTA; if the cover names a number, it is ${bodyN}.` : '',
        'Then fill caption, hashtags and search_phrase.',
      ]
        .filter(Boolean)
        .join(' ');
    } else {
      task = 'Write every WRITE slide.';
    }
    user.push(task);

    type Details = { caption: string; hashtags: string[]; search_phrase: string };
    const numbered = prepared ? prepared.made.numbered : spec.numbered && !story && !freestyle && manager;
    const bank = brand.hashtagBank.map((h) => h.replace(/^#/, '').replace(/[^\p{L}\p{N}_]/gu, '').toLowerCase()).filter(Boolean);
    const detailsOf = (parsed: DeckOut): Details => ({
      caption: clean(parsed.caption),
      hashtags: [
        ...new Set(
          (Array.isArray(parsed.hashtags) ? parsed.hashtags : [])
            .map((h) => String(h).replace(/^#/, '').replace(/[^\p{L}\p{N}_]/gu, '').toLowerCase())
            .filter(Boolean),
        ),
      ],
      search_phrase: clean(parsed.search_phrase).toLowerCase(),
    });
    const changedVs = (s: OutSlide, i: number) =>
      s.text !== slides[i].text || s.shot !== slides[i].shot || s.feature_id !== slides[i].inset_feature_id;

    /** Fixes what code can fix: numbering, cover colons, hedges, hashtag count. */
    const autoFix = (out: OutSlide[], details: Details | null) => {
      let n = 0;
      const fixed = out.map((s, i) => {
        const role = slides[i].role;
        if (role !== 'cover') n++;
        if (!writable.has(i) || !s.changed) return s;
        let text = s.text;
        if (!(keepTitle && i === 0)) {
          text = dropHedges(text);
          if (role === 'cover') text = dropColons(text);
          if (numbered && role !== 'cover' && text.trim()) text = renumber(text, n);
        }
        const next = { ...s, text, shot: dropHedges(s.shot) };
        return { ...next, changed: changedVs(next, i) };
      });
      let tags = details?.hashtags ?? [];
      if (details && tags.length < 3) tags = [...tags, ...bank.filter((h) => !tags.includes(h))].slice(0, 3);
      return { out: fixed, details: details ? { ...details, hashtags: tags.slice(0, 5) } : null };
    };
    const check = (out: OutSlide[], details: Details | null) => {
      const fails = checkDeck({
        out,
        slides,
        writable,
        shape,
        productName,
        banned: brand.bannedPhrases,
        numbered,
        details,
        plugInBody: freestyle && !slides.some((x) => x.role === 'cta'),
        format,
        allowBio: bioOk,
      });
      const coverText = out[0]?.text ?? '';
      const taken = drafting && coverText.trim() ? takenCovers.find((t) => overlap(t, coverText) > 0.75) : undefined;
      if (taken) fails.push(`[0] the cover repeats "${forModel(taken)}", which is taken; pick a different topic for the cover`);
      return fails;
    };
    // A draft writes every slide and the details in one go; sized for one post.
    const firstMax = drafting ? Math.min(3000, 900 + slides.length * 230) : 3000;

    const first = async (extra: string[]) => {
      const parsed = parseClaudeJson<DeckOut>(await ask(systemFor(wantDetails, mode === 'revise'), [...user, ...extra], firstMax));
      const merged = merge(parsed, slides, writable, known, forced);
      const raw = keepTitle
        ? merged.map((x, i) => (i === 0 ? { ...x, text: slides[0].text, changed: x.shot !== slides[0].shot } : x))
        : merged;
      const { out, details } = autoFix(raw, wantDetails ? detailsOf(parsed) : null);
      return { parsed, out, details, fails: check(out, details) };
    };

    // make: the writing call already ran; its deck goes straight to the checks.
    const seeded = () => {
      const parsed: DeckOut = {
        note: '',
        caption: prepared!.parsed.caption as string | undefined,
        hashtags: prepared!.parsed.hashtags as string[] | undefined,
        search_phrase: prepared!.parsed.search_phrase as string | undefined,
      };
      const { out, details } = autoFix(prepared!.made.out, detailsOf(parsed));
      return Promise.resolve({ parsed, out, details, fails: check(out, details) });
    };
    let result = await (prepared ? seeded() : first([])).catch((e) => {
      console.warn('write-deck first pass failed:', e instanceof Error ? e.message : e);
      // A draft only retries when its budget still fits a full post.
      if (drafting && left() < 25_000) throw e;
      return first(['Your last answer was not valid JSON. Answer with the JSON object only.']);
    });

    // Repair only what still fails: the failing slides as WRITE (everything
    // else KEEP) and the details only when they failed. Length misses within
    // a few words ship as they are.
    // A draft repairs only while its budget still fits the call.
    if (result.fails.length && !result.fails.every(nearMiss) && (!drafting || left() > 12_000)) {
      const redo = new Set<number>();
      let redoDetails = false;
      for (const f of result.fails) {
        const m = f.match(/^\[(\d+)\]/);
        if (!m) redoDetails = wantDetails;
        else if (writable.has(Number(m[1]))) redo.add(Number(m[1]));
      }
      if (redo.size || redoDetails) {
        const base: InSlide[] = slides.map((s, i) => ({ ...s, text: result.out[i].text, shot: result.out[i].shot, inset_feature_id: result.out[i].feature_id }));
        const order = [...redo].sort((a, b) => a - b);
        const fails = result.fails.filter((f) => {
          const m = f.match(/^\[(\d+)\]/);
          return m ? redo.has(Number(m[1])) : redoDetails;
        });
        const ask2 = [
          ...deckContext(base, redo, false),
          mode === 'revise'
            ? `THE MANAGER'S FEEDBACK (it is law; every rewrite still follows it): ${body.feedback!.slice(0, 2000)}`
            : mode === 'details'
              ? ''
              : drafting
                ? 'Write every WRITE slide so it fits the post around it.'
                : task,
          redoDetails && result.details
            ? `YOUR LAST caption: ${result.details.caption || '(none)'} | hashtags: ${result.details.hashtags.join(' ') || '(none)'} | search phrase: ${result.details.search_phrase || '(none)'}`
            : '',
          `These failed checks. ${redo.size ? 'Rewrite only the WRITE slides so every line below passes; KEEP slides are final.' : 'slides is an empty array.'} ${redoDetails ? 'Rewrite caption, hashtags and search_phrase.' : ''}\n${fails.map((f) => `- ${f}`).join('\n')}`,
        ].filter(Boolean);
        const max = Math.min(3000, 600 + order.length * 350 + (redoDetails ? 400 : 0));
        const repaired = await ask(systemFor(redoDetails, false), ask2, max)
          .then((raw) => {
            const parsed = parseClaudeJson<DeckOut>(raw);
            // A slide without i maps to the k-th index asked for.
            parsed.slides = (parsed.slides ?? []).map((x, k) => (typeof x.i === 'number' ? x : { ...x, i: order[k] }));
            const fixedSlides = merge(parsed, base, redo, known, forced);
            const combined = result.out.map((s, i) => {
              if (!redo.has(i)) return s;
              const x = keepTitle && i === 0 ? { ...fixedSlides[i], text: slides[0].text } : fixedSlides[i];
              return { ...x, changed: changedVs(x, i) };
            });
            const { out, details } = autoFix(combined, redoDetails ? detailsOf(parsed) : result.details);
            return { parsed: { ...parsed, note: result.parsed.note }, out, details, fails: check(out, details) };
          })
          .catch((e) => {
            console.warn('write-deck repair failed:', e instanceof Error ? e.message : e);
            return null;
          });
        if (repaired && repaired.fails.length <= result.fails.length) result = repaired;
      }
    }

    if (prepared) {
      return jsonResponse({
        format,
        post_type_id: prepared.made.typeId,
        kind: 'handheld',
        cover: result.out[0]?.text ?? '',
        say: format === 'reel' ? (result.out[0]?.shot ?? '') : '',
        slides: result.out.map((x, i) => ({
          role: slides[i].role,
          text: x.text,
          shot: x.shot,
          feature_id: slides[i].role === 'cta' ? x.feature_id : null,
          ...(slides[i].role === 'cta' && slides[i].place ? { place: slides[i].place } : {}),
        })),
        caption: result.details?.caption ?? '',
        hashtags: result.details?.hashtags ?? [],
        search_phrase: result.details?.search_phrase ?? '',
        source_note: prepared.made.sourceNote,
        warnings: result.fails,
      });
    }

    if (drafting) {
      return jsonResponse({
        cover: result.out[0]?.text ?? '',
        slides: result.out.map((x, i) => ({ role: slides[i].role, text: x.text, shot: x.shot, feature_id: slides[i].role === 'cta' ? x.feature_id : null })),
        caption: result.details?.caption ?? '',
        hashtags: result.details?.hashtags ?? [],
        search_phrase: result.details?.search_phrase ?? '',
        warnings: result.fails,
      });
    }

    return jsonResponse({
      slides: result.out,
      caption: result.details?.caption ?? null,
      hashtags: result.details?.hashtags ?? null,
      search_phrase: result.details?.search_phrase ?? null,
      note: clean(result.parsed.note) || null,
      warnings: result.fails,
    });
  } catch (error) {
    console.error('write-deck failed:', error);
    return jsonResponse({ error: tooLong(error) ? 'The AI took too long. Try again.' : error instanceof Error ? error.message : 'write-deck failed' }, 500);
  }
});
