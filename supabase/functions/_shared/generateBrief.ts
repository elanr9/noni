// Generation core shared by ingest-brief (whole drafts) and brief-assist
// (per-field regeneration, segment derivation). Owns the system prompt, the
// JSON contract, normalization, and brief_segments derivation.
//
// The generation order is the method and the JSON key order enforces it
// (generation is autoregressive, so key order IS generation order):
// claim -> search phrase -> talking points (+plug) -> HOOK LAST -> caption.
//
// Kill rather than pad: the model may answer {"kill_reason": string} instead
// of a draft when a required field cannot be concrete. Callers return that to
// the client; the slot stays empty with the reason shown.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import type { BrandContext } from './wp8.ts';
import { legacyBrandLines } from './wp8.ts';
import { validateBrief } from './validateBrief.ts';
import type {
  BriefDraftShape,
  PostTypeShape,
  TalkingPoint,
  ValidationResult,
} from './validateBrief.ts';

export type PostTypeRow = {
  id: string;
  key: string;
  label: string;
  family: 'video' | 'photo_carousel';
  min_points: number;
  max_points: number;
  clip_structure: 'hook_points_outro' | 'single_clip' | 'slide_per_point';
  requires_plug: boolean;
  requires_credential: boolean;
  target_words_min: number | null;
  target_words_max: number | null;
};

export async function loadPostType(
  admin: SupabaseClient,
  companyId: string,
  key: string,
): Promise<PostTypeRow | null> {
  const { data, error } = await admin
    .from('post_types')
    .select(
      'id, key, label, family, min_points, max_points, clip_structure, requires_plug, requires_credential, target_words_min, target_words_max',
    )
    .eq('company_id', companyId)
    .eq('key', key)
    .maybeSingle();
  if (error) throw new Error(`post_types read failed: ${error.message}`);
  return data as PostTypeRow | null;
}

export function toPostTypeShape(row: PostTypeRow): PostTypeShape {
  return {
    key: row.key,
    family: row.family,
    min_points: row.min_points,
    max_points: row.max_points,
    requires_plug: row.requires_plug,
    target_words_min: row.target_words_min,
    target_words_max: row.target_words_max,
  };
}

// ---------------------------------------------------------------------------
// Prompt building

const JSON_CONTRACT =
  '{"claim_id": string | null, "search_phrase": string, "point_count": number, "talking_points": [{"id": string, "text": string, "is_product": boolean, "claim_id": string | null, "overlay_label": string}], "cta": string | null, "script": string | null, "target_words": number, "hook_options": [{"text": string, "score": number}], "title": string, "caption": string, "hashtags": string[], "why_it_works": string}';

const KILL_RULE = `KILL ONLY AS LAST RESORT: almost never kill. If the topic is thin, still write the best concrete brief you can from product truth and audience. Do NOT kill because the topic is a competitor, a comparison, or feels awkward for a plug — pick the closest approved claim and angle the plug as what to do instead. Only answer {"kill_reason": string} if the search phrase is empty or pure gibberish with zero usable topic.`;

const CREDENTIAL_RULE = `CREDENTIAL: never write a creator credential, background claim, or playing history into the hook or any talking point. "As a former D1 player, here are five tips" is forbidden. One brief serves the whole roster; each creator's credential renders at record time from their profile, so a written one doubles up. The hook starts at the content.`;

const SECOND_PERSON_RULE = `SECOND PERSON: aim for 5 to 6 uses of "you" or "your" per 100 words. Every strong post talks straight at one person.`;

const HOOK_RULES = `HOOKS (write these LAST, against the finished talking points): hook_options is 8 to 10 variants, each 9 words or fewer. At least one restates the search phrase so a searcher knows they landed right; include contradiction and curiosity angles. Score each 0 to 100 for how hard it stops the viewer who typed the search phrase; do not reuse the same score. Single speaker only. No "Wait what?", no second voice, no dialogue, ever.`;

const CAPTION_RULES = `CAPTION (after the hooks): under 200 characters, no hashtags inside it, and the search phrase appears in the first sentence. HASHTAGS: 3 to 5 tags chosen from the hashtag bank in the message by topical fit, not the same set every time.`;

const POINT_RULES = `TALKING POINTS: beats, not lines. Under 25 words each. A creator reads a point and starts talking; they do not recite it. If a point reads as a complete performable sentence with closing rhythm, compress it. Give every point a short unique id. Also give every point an overlay_label: the on-screen label for its clip, 5 words or fewer, numbered when the type is a list ("4. Great thumbnail").`;

const SEARCH_PHRASE_RULE = `SEARCH PHRASE: the search string a target viewer actually types with a deadline in mind, e.g. "why am i not getting recruited for college soccer".`;

function plugRule(requiresPlug: boolean): string {
  if (!requiresPlug) {
    return `PLUG: this type takes NO plug and NO credential. claim_id null, cta null, is_product false on every point. Do not mention the product.`;
  }
  return `CLAIM AND PLUG (settle this first): pick the one approved claim from the message that fits this topic best (or the closest useful one) and put its id in the top-level claim_id. Competitor or comparison topics still get a plug — angle it as the practical next step using a real approved capability (emails, school list, film, price), never invent competitor facts or fake positioning. The plug is ONE sentence composed from that claim — mechanism, not benefit: "writes and sends the emails and follows up", never "streamlines your outreach". Put that exact sentence in cta AND inside exactly one talking point, riding with that point's advice (set is_product true and claim_id on that point). Never the first point, never the last, never a standalone plug point.`;
}

function postTypeBlock(postType: PostTypeRow | null, fallbackFormat: 'video' | 'photo_carousel'): string {
  if (!postType) {
    return [
      `FORMAT: ${fallbackFormat === 'photo_carousel' ? 'photo carousel — each talking point becomes one slide, read not spoken' : 'video — hook clip, one clip per talking point, outro clip'}.`,
      `POINT COUNT: 3 to 10; point_count comes from the concept ("5 tips" means 5), default 4.`,
      `TARGET WORDS: set target_words to your honest estimate of spoken words for the finished post. There is no length target.`,
    ].join('\n');
  }
  const lines: string[] = [];
  const structure =
    postType.clip_structure === 'hook_points_outro'
      ? 'hook clip, one clip per talking point, outro clip'
      : postType.clip_structure === 'single_clip'
        ? 'one single clip'
        : 'photo carousel, one slide per talking point';
  lines.push(
    `POST TYPE: ${postType.label} (${postType.family}). Structure: ${structure}. Talking points: ${postType.min_points} to ${postType.max_points} — pick the count this topic actually supports.`,
  );
  if (postType.key === 'contrast') {
    lines.push(
      `CONTRAST: one speaker alternating between two sides (red flags vs green flags, D3 commit vs D1 commit, 10 offers vs 0 offers). Never two people talking.`,
    );
  }
  if (postType.clip_structure === 'single_clip') {
    lines.push(
      `REPLAY BAIT: one 6 to 9 second clip carrying on-screen text that takes slightly longer to read than the clip runs, so the viewer loops it. The hook options are candidates for that on-screen text. The single talking point says what the creator does on camera during the clip.`,
    );
  }
  // Title shape is type-native. Search phrase anchors discovery; title is
  // what the admin scans in the grid and must read as that format.
  switch (postType.key) {
    case 'numbered_list':
    case 'numbered_tips':
      lines.push(
        `TITLE SHAPE: lead with point_count, then a list frame tied to the topic — e.g. "5 tips for a perfect highlight video", "8 things I wish I knew about college recruiting", "7 mistakes killing your film". Never paste the search phrase as the title.`,
      );
      break;
    case 'talking_head':
      lines.push(
        `TITLE SHAPE: first-person or direct address story beat, e.g. "How I got my first D1 offer", "What coaches actually reply to". Not a numbered list title.`,
      );
      break;
    case 'explainer':
      lines.push(
        `TITLE SHAPE: why/how explainer, e.g. "Why coaches skip your email", "How NCSA actually works". Clear and specific.`,
      );
      break;
    case 'contrast':
      lines.push(
        `TITLE SHAPE: two sides with "vs" or clear opposition, e.g. "D1 commit vs D3 commit", "10 offers vs 0 offers".`,
      );
      break;
    case 'replay_bait':
      lines.push(
        `TITLE SHAPE: short loop provocation matching the on-screen text vibe, under 8 words.`,
      );
      break;
    case 'how_to':
      lines.push(
        `TITLE SHAPE: how-to frame, e.g. "How to email college coaches", "How to build a highlight reel".`,
      );
      break;
    case 'getting_started':
      lines.push(
        `TITLE SHAPE: beginner start frame, e.g. "Start recruiting with zero offers", "First steps to get on a coach radar".`,
      );
      break;
    default:
      break;
  }
  if (postType.family === 'photo_carousel') {
    lines.push(
      `SLIDES: talking points are read on screen, not spoken. The first slide's text is the hook. script holds the slide-by-slide overlay copy, one short paragraph per talking point, in order.`,
    );
  } else {
    lines.push(`SCRIPT: null for video; the talking points are the brief.`);
  }
  lines.push(
    postType.target_words_min !== null && postType.target_words_max !== null
      ? `TARGET WORDS: target_words between ${postType.target_words_min} and ${postType.target_words_max}; the talking points must hold enough substance to fill it.`
      : `TARGET WORDS: no length target for this type; set target_words to your honest estimate of spoken words.`,
  );
  return lines.join('\n');
}

function briefSystemBlocks(
  postType: PostTypeRow | null,
  fallbackFormat: 'video' | 'photo_carousel',
  bannedPhrases: string[],
  preamble: string,
  portRule: string | null,
): string {
  const requiresPlug = postType ? postType.requires_plug : true;
  return [
    preamble,
    KILL_RULE,
    `Otherwise answer with a single JSON object, no markdown fences, no preamble. Generate the keys IN THIS EXACT ORDER — the order is the method: the claim and search phrase anchor the body, the hooks are written last against the finished body, the caption after the hooks:\n${JSON_CONTRACT}`,
    postTypeBlock(postType, fallbackFormat),
    portRule,
    `Rules, measured against real high performing posts. Follow the numbers exactly.`,
    plugRule(requiresPlug),
    SEARCH_PHRASE_RULE,
    POINT_RULES,
    CREDENTIAL_RULE,
    SECOND_PERSON_RULE,
    HOOK_RULES,
    `TITLE: the admin-facing name of THIS post format — never copy search_phrase into title. For numbered_list and numbered_tips the title MUST start with the chosen point_count digit and a list phrase (tips / things / mistakes / signs). Other types follow TITLE SHAPE above. Keep it under 12 words.`,
    CAPTION_RULES,
    `WHY IT WORKS: one punchy sentence a content strategist would say about why this concept performs.`,
    bannedPhrases.length
      ? `BANNED PHRASES: the admin has banned these exact phrases; never use them: ${bannedPhrases.join(' | ')}`
      : null,
  ]
    .filter((l): l is string => l !== null)
    .join('\n\n');
}

export function buildBriefSystem(
  postType: PostTypeRow | null,
  fallbackFormat: 'video' | 'photo_carousel',
  bannedPhrases: string[],
): string {
  return briefSystemBlocks(
    postType,
    fallbackFormat,
    bannedPhrases,
    `You write structured UGC content briefs for creators posting on TikTok and Instagram from their own accounts.`,
    null,
  );
}

const PORT_PREAMBLE = `You port a finished UGC post into a different format for the same brand. The source post is in the message. Keep its idea, angle and substance; rewrite every line so it is native to the target format. This is a port, not a new topic: the ported post covers the same ground as the source and answers the same viewer question.`;

function portRule(
  targetPostType: PostTypeRow | null,
  fallbackFormat: 'video' | 'photo_carousel',
): string {
  const family = targetPostType ? targetPostType.family : fallbackFormat;
  if (family === 'photo_carousel') {
    return `PORTING A VIDEO TO A SLIDESHOW: the source points were spoken, these are read. Each talking point becomes one slide the reader takes in under three seconds, so compress hard and keep the concrete detail, never the filler. Strip every spoken-only phrase ("in this video", "stick around", "let me explain"). The first slide's text is the hook, rewritten to stop a scroll rather than open a monologue. Keep the source's point order and its point count unless the type's limits forbid it.`;
  }
  return `PORTING A SLIDESHOW TO A VIDEO: the source slides were read, these are spoken. Each slide becomes a talking point with the substance a creator can actually talk around for a few seconds, not the clipped slide wording. The source's first slide was its hook, so write fresh hook_options against the finished points rather than reusing that line verbatim. Keep the source's point order and its point count unless the type's limits forbid it.`;
}

export function buildPortSystem(
  targetPostType: PostTypeRow | null,
  fallbackFormat: 'video' | 'photo_carousel',
  bannedPhrases: string[],
): string {
  return briefSystemBlocks(
    targetPostType,
    fallbackFormat,
    bannedPhrases,
    PORT_PREAMBLE,
    portRule(targetPostType, fallbackFormat),
  );
}

/** The finished post a port reads from, flattened for the user message. */
export type SourceBrief = {
  title: string;
  searchPhrase: string | null;
  format: 'video' | 'photo_carousel';
  postTypeLabel: string | null;
  hook: string | null;
  talkingPoints: Array<{ text: string | null; is_product: boolean }>;
  cta: string | null;
  caption: string | null;
  hashtags: string[];
  script: string | null;
  /** On-screen copy per clip or slide, in slot order. */
  overlayTexts: string[];
};

export function sourceBriefLines(source: SourceBrief): string[] {
  const kind = source.format === 'photo_carousel' ? 'slideshow' : 'video';
  const lines = [
    `Source post (a finished ${kind}${source.postTypeLabel ? `, type "${source.postTypeLabel}"` : ''}):`,
    `Title: ${source.title || '(none)'}`,
    `Search phrase: ${source.searchPhrase ?? '(none)'}`,
    `Hook: ${source.hook ?? '(none)'}`,
    `${source.format === 'photo_carousel' ? 'Slides' : 'Talking points'} (${source.talkingPoints.length}):\n${source.talkingPoints
      .map(
        (p, i) =>
          `[${i}]${p.is_product ? ' (product point)' : ''} ${p.text ?? '(empty)'}`,
      )
      .join('\n')}`,
    `Plug sentence (cta): ${source.cta ?? '(none)'}`,
    `Caption: ${source.caption || '(none)'}`,
    `Hashtags: ${source.hashtags.join(' ') || '(none)'}`,
  ];
  if (source.overlayTexts.length) {
    lines.push(`On-screen text, in order: ${source.overlayTexts.join(' | ')}`);
  }
  if (source.script?.trim()) {
    lines.push(`Slide copy:\n${source.script.trim()}`);
  }
  return lines;
}

export type RegenField =
  | 'search_phrase'
  | 'talking_points'
  | 'talking_point'
  | 'hook'
  | 'caption';

/**
 * Per-field regeneration prompts. Each returns JSON holding only the
 * regenerated field(s); the current draft rides in the user message as
 * context so the result stays consistent with what the admin kept.
 */
export function buildFieldSystem(
  field: RegenField,
  postType: PostTypeRow | null,
  fallbackFormat: 'video' | 'photo_carousel',
  bannedPhrases: string[],
): string {
  const requiresPlug = postType ? postType.requires_plug : true;
  const preamble = `You revise one part of a structured UGC content brief for creators posting on TikTok and Instagram. The current brief is in the message; regenerate ONLY what is asked and keep it consistent with the parts the admin is keeping. Answer with a single JSON object, no markdown fences, no preamble.`;
  const banned = bannedPhrases.length
    ? `BANNED PHRASES: the admin has banned these exact phrases; never use them: ${bannedPhrases.join(' | ')}`
    : null;
  const blocks: (string | null)[] = [preamble];
  switch (field) {
    case 'search_phrase':
      blocks.push(
        SEARCH_PHRASE_RULE,
        `Write the search phrase the finished talking points actually answer, different from the current one. JSON: {"search_phrase": string}`,
      );
      break;
    case 'talking_points':
      blocks.push(
        KILL_RULE,
        `Otherwise answer with the keys IN THIS EXACT ORDER: {"claim_id": string | null, "point_count": number, "talking_points": [{"id": string, "text": string, "is_product": boolean, "claim_id": string | null, "overlay_label": string}], "cta": string | null, "script": string | null, "target_words": number}`,
        postTypeBlock(postType, fallbackFormat),
        plugRule(requiresPlug),
        POINT_RULES,
        CREDENTIAL_RULE,
        SECOND_PERSON_RULE,
        banned,
      );
      break;
    case 'talking_point':
      blocks.push(
        KILL_RULE,
        `Otherwise answer: {"talking_point": {"id": string, "text": string, "is_product": boolean, "claim_id": string | null, "overlay_label": string}}`,
        `Regenerate ONLY the talking point at the index named in the message. Keep its id. Do not duplicate or contradict the other points; they stay exactly as given. If it is the is_product point, it stays the plug point: keep its claim_id and compose the plug sentence from that approved claim (the same sentence stays in cta, so keep it a single plug sentence riding with the point's advice).`,
        POINT_RULES,
        CREDENTIAL_RULE,
        SECOND_PERSON_RULE,
        banned,
      );
      break;
    case 'hook':
      blocks.push(
        `JSON: {"hook_options": [{"text": string, "score": number}]}`,
        HOOK_RULES,
        CREDENTIAL_RULE,
        banned,
      );
      break;
    case 'caption':
      blocks.push(
        `JSON: {"caption": string, "hashtags": string[]}`,
        CAPTION_RULES,
        banned,
      );
      break;
  }
  return blocks.filter((b): b is string => b !== null).join('\n\n');
}

export function brandDocBlocks(brand: BrandContext): string[] {
  const docBlocks: string[] = [`Brand: ${brand.companyName}`];
  if (brand.docs.productTruth.trim()) {
    docBlocks.push(`Product truth:\n${brand.docs.productTruth.trim()}`);
  }
  if (brand.docs.voice.trim()) {
    docBlocks.push(`Voice:\n${brand.docs.voice.trim()}`);
  }
  if (brand.docs.learnings.trim()) {
    docBlocks.push(`What has worked so far:\n${brand.docs.learnings.trim()}`);
  }
  if (docBlocks.length === 1) docBlocks.push(legacyBrandLines(brand));

  docBlocks.push(
    brand.approvedClaims.length
      ? `Approved claims (the ONLY source for the plug; reference by id):\n${brand.approvedClaims
          .map((c) => `- id ${c.id}: ${c.claim} (${c.what_it_does})`)
          .join('\n')}`
      : 'Approved claims: none exist yet. Write the brief without a product plug (cta null, is_product false).',
  );
  docBlocks.push(
    brand.hashtagBank.length
      ? `Hashtag bank (pick 3 to 5): ${brand.hashtagBank.join(' ')}`
      : 'Hashtag bank: empty.',
  );
  return docBlocks;
}

// ---------------------------------------------------------------------------
// Normalization

type RawPoint = {
  id?: string;
  text: string | null;
  is_product: boolean;
  claim_id?: string | null;
  overlay_label?: string | null;
};

type RawHook = { text?: string; score?: number } | string;

export type RawGenerated = {
  kill_reason?: string;
  claim_id?: string | null;
  search_phrase?: string;
  point_count?: number;
  talking_points?: RawPoint[];
  cta?: string | null;
  script?: string | null;
  target_words?: number;
  hook_options?: RawHook[];
  title?: string;
  caption?: string;
  hashtags?: string[];
  why_it_works?: string;
};

export type DraftWithCta = BriefDraftShape;

export type GeneratedDraft = {
  draft: DraftWithCta;
  // Model-authored on-screen labels, index-aligned with talking_points.
  // They live only in brief_segments, never in talking_points jsonb.
  overlayLabels: (string | null)[];
};

export type GenOutcome = { kill_reason: string } | GeneratedDraft;

export function isKill(outcome: GenOutcome): outcome is { kill_reason: string } {
  return 'kill_reason' in outcome;
}

/** Best-first: sort scored hooks descending and keep the strings. */
export function sortHooks(raw: RawHook[] | undefined): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((h) =>
      typeof h === 'string'
        ? { text: h, score: 0 }
        : { text: String(h.text ?? ''), score: typeof h.score === 'number' ? h.score : 0 },
    )
    .filter((h) => h.text.trim().length > 0)
    .sort((a, b) => b.score - a.score)
    .map((h) => h.text);
}

function numberedListTitle(
  title: string,
  searchPhrase: string | null,
  pointCount: number,
): string {
  const trimmed = title.trim();
  const phrase = (searchPhrase ?? '').trim().toLowerCase();
  const startsWithCount = new RegExp(`^${pointCount}\\b`).test(trimmed);
  const isPhraseCopy =
    Boolean(phrase) && trimmed.toLowerCase() === phrase;
  if (startsWithCount && !isPhraseCopy) return trimmed;
  const topic = (searchPhrase ?? 'college recruiting')
    .replace(/^(is|are|does|do|how|why|what|when|should)\s+/i, '')
    .replace(/\?+$/g, '')
    .trim();
  return `${pointCount} things to know about ${topic}`;
}

export function normalizeGenerated(
  raw: RawGenerated,
  format: 'video' | 'photo_carousel',
  postTypeKey?: string | null,
): GenOutcome {
  if (typeof raw.kill_reason === 'string' && raw.kill_reason.trim()) {
    return { kill_reason: raw.kill_reason.trim() };
  }
  const rawPoints = raw.talking_points ?? [];
  const points: TalkingPoint[] = rawPoints.map((p, i) => ({
    id: p.id?.trim() || `p${i + 1}-${crypto.randomUUID().slice(0, 8)}`,
    text: typeof p.text === 'string' ? p.text : null,
    is_product: Boolean(p.is_product),
    edited_by_admin: false,
    claim_id: p.claim_id ?? null,
  }));
  const overlayLabels = rawPoints.map((p) =>
    typeof p.overlay_label === 'string' && p.overlay_label.trim()
      ? p.overlay_label.trim()
      : null,
  );
  const pointCount =
    typeof raw.point_count === 'number' ? raw.point_count : points.length;
  const searchPhrase = raw.search_phrase?.trim() || null;
  let title = raw.title ?? '';
  if (postTypeKey === 'numbered_list' || postTypeKey === 'numbered_tips') {
    title = numberedListTitle(title, searchPhrase, pointCount);
  }
  return {
    draft: {
      title,
      search_phrase: searchPhrase,
      format,
      point_count: pointCount,
      target_words: typeof raw.target_words === 'number' ? raw.target_words : 380,
      hook_options: sortHooks(raw.hook_options),
      talking_points: points,
      cta: typeof raw.cta === 'string' && raw.cta.trim() ? raw.cta.trim() : null,
      caption: raw.caption ?? '',
      hashtags: Array.isArray(raw.hashtags) ? raw.hashtags.map((h) => String(h)) : [],
      why_it_works: raw.why_it_works ?? '',
      script: format === 'photo_carousel' ? (raw.script ?? null) : null,
    },
    overlayLabels,
  };
}

/**
 * One draft, validated, with a single corrective retry. Every attempt is
 * logged to brief_validations against the generation_id, which joins to the
 * brief once the client saves it.
 */
export async function generateValidated(
  admin: SupabaseClient,
  companyId: string,
  generationId: string,
  postType: PostTypeRow | null,
  draftOnce: (priorFailures: string[]) => Promise<GenOutcome>,
  validationCtx: { hashtagBank: string[]; approvedClaimIds: string[] },
): Promise<{ outcome: GenOutcome; warnings: string[] }> {
  const ctx = {
    ...validationCtx,
    postType: postType ? toPostTypeShape(postType) : null,
  };
  const logAttempt = async (attempt: number, res: ValidationResult) => {
    const { error } = await admin.from('brief_validations').insert({
      company_id: companyId,
      generation_id: generationId,
      attempt,
      passed: res.passed,
      failures: res.failures,
      warnings: res.warnings,
    });
    if (error) console.error('brief_validations insert failed:', error.message);
  };

  let outcome = await draftOnce([]);
  if (isKill(outcome)) return { outcome, warnings: [] };
  let result = validateBrief(outcome.draft, ctx);
  await logAttempt(1, result);
  if (!result.passed) {
    const retry = await draftOnce(result.failures);
    if (isKill(retry)) return { outcome: retry, warnings: [] };
    outcome = retry;
    result = validateBrief(outcome.draft, ctx);
    await logAttempt(2, result);
  }
  const warnings = result.passed
    ? result.warnings
    : [...result.failures, ...result.warnings];
  return { outcome, warnings };
}

// ---------------------------------------------------------------------------
// brief_segments derivation (HANDOFF defaults)

export type SegmentDraft = {
  slot_index: number;
  kind: 'hook' | 'point' | 'outro' | 'slide';
  talking_point_index: number | null;
  overlay_text: string | null;
  show_on_screen: boolean;
};

function fallbackLabel(index: number, text: string | null): string | null {
  if (!text) return null;
  const words = text.split(/\s+/).filter(Boolean).slice(0, 4).join(' ');
  return `${index + 1}. ${words}`;
}

/**
 * One row per clip or slide, including hook and outro.
 * hook_points_outro: [hook][point 0..n-1][outro]; hook overlay = the hook
 * line, point overlay = short label, outro = null with show_on_screen false.
 * single_clip: one hook-kind segment carrying the hook line.
 * slide_per_point: one slide per point, overlay = the point text (read, not
 * spoken); no hook or outro clip.
 */
export function deriveSegments(params: {
  clipStructure: PostTypeRow['clip_structure'];
  hook: string | null;
  talkingPoints: Array<{ text: string | null }>;
  overlayLabels?: (string | null)[];
}): SegmentDraft[] {
  const { clipStructure, hook, talkingPoints, overlayLabels } = params;
  if (clipStructure === 'single_clip') {
    return [
      {
        slot_index: 0,
        kind: 'hook',
        talking_point_index: null,
        overlay_text: hook,
        show_on_screen: true,
      },
    ];
  }
  if (clipStructure === 'slide_per_point') {
    return talkingPoints.map((p, i) => ({
      slot_index: i,
      kind: 'slide' as const,
      talking_point_index: i,
      overlay_text: p.text,
      show_on_screen: true,
    }));
  }
  const segments: SegmentDraft[] = [
    {
      slot_index: 0,
      kind: 'hook',
      talking_point_index: null,
      overlay_text: hook,
      show_on_screen: true,
    },
  ];
  talkingPoints.forEach((p, i) => {
    segments.push({
      slot_index: i + 1,
      kind: 'point',
      talking_point_index: i,
      overlay_text: overlayLabels?.[i] ?? fallbackLabel(i, p.text),
      show_on_screen: true,
    });
  });
  segments.push({
    slot_index: talkingPoints.length + 1,
    kind: 'outro',
    talking_point_index: null,
    overlay_text: null,
    show_on_screen: false,
  });
  return segments;
}
