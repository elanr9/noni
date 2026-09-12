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

import type { BrainFeature, BrandContext } from './wp8.ts';
import { askClaude, legacyBrandLines, parseClaudeJson } from './wp8.ts';
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

const POST_TYPE_COLUMNS =
  'id, key, label, family, min_points, max_points, clip_structure, requires_plug, requires_credential, target_words_min, target_words_max';

/**
 * Lets the model pick the kind of post the source material actually wants
 * ("5 mistakes" is a list, "X vs Y" is a contrast, one blunt truth is a
 * 7 second video) instead of every idea landing in the first type. The
 * company's recent mix is a tie breaker toward variety. Never throws on a
 * bad answer: falls back to the type least used lately.
 */
export async function pickPostType(
  admin: SupabaseClient,
  companyId: string,
  family: 'video' | 'photo_carousel',
  sourceLines: string[],
): Promise<PostTypeRow | null> {
  const [{ data: typeRows, error: typeError }, { data: recentRows }] = await Promise.all([
    admin
      .from('post_types')
      .select(POST_TYPE_COLUMNS)
      .eq('company_id', companyId)
      .eq('family', family)
      .order('sort_order', { ascending: true }),
    admin
      .from('briefs')
      .select('post_type_id')
      .eq('company_id', companyId)
      .not('post_type_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(12),
  ]);
  if (typeError) throw new Error(`post_types read failed: ${typeError.message}`);
  const types = (typeRows ?? []) as PostTypeRow[];
  if (types.length === 0) return null;
  if (types.length === 1) return types[0];

  const recentIds = ((recentRows ?? []) as { post_type_id: string | null }[]).map(
    (r) => r.post_type_id,
  );
  const recentKeys = recentIds
    .map((id) => types.find((t) => t.id === id)?.key ?? null)
    .filter((k): k is string => k !== null);
  const leastUsed = [...types].sort(
    (a, b) =>
      recentKeys.filter((k) => k === a.key).length -
      recentKeys.filter((k) => k === b.key).length,
  )[0];

  const options = types
    .map(
      (t) =>
        `- ${t.key}: ${t.label}. ${t.min_points === t.max_points ? t.min_points : `${t.min_points} to ${t.max_points}`} talking point${t.max_points === 1 ? '' : 's'}${t.clip_structure === 'single_clip' ? ', one clip only' : ''}.`,
    )
    .join('\n');
  const system = [
    'You choose which kind of short form post a piece of source material should become.',
    'Answer with a single JSON object {"key": string} and nothing else. key must be one of the option keys exactly.',
    'Pick by fit first: a counted set of tips or mistakes is a list; two sides or a before/after is a contrast; a how or why breakdown is an explainer; a personal story or opinion is a talking head; one blunt truth that fits in a sentence is a seven second video; a satisfying visual moment with no lesson is replay bait.',
    'When two kinds fit equally, prefer the one used least in the recent mix.',
  ].join('\n');
  const user = [
    `Options:\n${options}`,
    recentKeys.length
      ? `Recent mix, newest first: ${recentKeys.join(', ')}`
      : 'Recent mix: nothing yet.',
    `Source material:\n${sourceLines.join('\n').slice(0, 3000)}`,
  ].join('\n\n');

  try {
    const raw = await askClaude(system, user, 64);
    const parsed = parseClaudeJson<{ key?: unknown }>(raw);
    const chosen = types.find((t) => t.key === parsed.key);
    return chosen ?? leastUsed;
  } catch (e) {
    console.warn('pickPostType fell back:', e instanceof Error ? e.message : e);
    return leastUsed;
  }
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
  '{"claim_id": string | null, "search_phrase": string, "point_count": number, "talking_points": [{"id": string, "text": string, "is_product": boolean, "claim_id": string | null, "feature_id": string | null, "overlay_label": string}], "cta": string | null, "script": string | null, "target_words": number, "hook_options": [{"text": string, "score": number}], "title": string, "caption": string, "hashtags": string[], "why_it_works": string}';

const KILL_RULE = `KILL ONLY AS LAST RESORT: almost never kill. If the topic is thin, still write the best concrete brief you can from product truth and audience. Do NOT kill because the topic is a competitor, a comparison, or feels awkward for a plug — pick the closest approved claim and angle the plug as what to do instead. Only answer {"kill_reason": string} if the search phrase is empty or pure gibberish with zero usable topic.`;

const CREDENTIAL_RULE = `CREDENTIAL: never write a creator credential, background claim, or playing history into the hook or any talking point. "As a former D1 player, here are five tips" is forbidden. One brief serves the whole roster; each creator's credential renders at record time from their profile, so a written one doubles up. The hook starts at the content.`;

const SECOND_PERSON_RULE = `SECOND PERSON: aim for 5 to 6 uses of "you" or "your" per 100 words. Every strong post talks straight at one person.`;

const HOOK_RULES = `HOOKS (write these LAST, against the finished talking points): hook_options is 8 to 10 variants, each 9 words or fewer. At least one restates the search phrase so a searcher knows they landed right; include contradiction and curiosity angles. Score each 0 to 100 for how hard it stops the viewer who typed the search phrase; do not reuse the same score. Single speaker only. No "Wait what?", no second voice, no dialogue, ever.`;

const CAPTION_RULES = `CAPTION (after the hooks): under 200 characters, no hashtags inside it, and the search phrase appears in the first sentence. HASHTAGS: 3 to 5 tags chosen from the hashtag bank in the message by topical fit, not the same set every time.`;

const POINT_RULES = `TALKING POINTS: beats, not lines. Under 25 words each. A creator reads a point and starts talking; they do not recite it. If a point reads as a complete performable sentence with closing rhythm, compress it. Give every point a short unique id. Also give every point an overlay_label: the on-screen label for its clip, 5 words or fewer, numbered when the type is a list ("4. Great thumbnail").`;

const FEATURE_ID_RULE = `FEATURE ID: every talking point carries feature_id. On a product point it is the id of the one entry in the Feature library (in the message) that the point is about, copied exactly; null when the point is not about a specific feature. Non product points are always null. If the message says the Feature library is empty, feature_id is null on every point.`;

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
  if (postType.key === 'seven_second') {
    lines.push(
      `SEVEN SECOND VIDEO: one clip of about 7 seconds. The creator says ONE complete, specific idea out loud in one or two short sentences (12 to 25 words total) and the same line sits on screen. No intro, no list, no outro, no plug. The hook options are candidates for that spoken line and must each stand alone as the whole video. The single talking point is that spoken line.`,
    );
  } else if (postType.clip_structure === 'single_clip') {
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
    case 'seven_second':
      lines.push(
        `TITLE SHAPE: the one idea as a blunt statement, under 8 words, e.g. "Coaches decide in 8 seconds", "Your film starts too late".`,
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
    FEATURE_ID_RULE,
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
        `Otherwise answer with the keys IN THIS EXACT ORDER: {"claim_id": string | null, "point_count": number, "talking_points": [{"id": string, "text": string, "is_product": boolean, "claim_id": string | null, "feature_id": string | null, "overlay_label": string}], "cta": string | null, "script": string | null, "target_words": number}`,
        postTypeBlock(postType, fallbackFormat),
        plugRule(requiresPlug),
        POINT_RULES,
        FEATURE_ID_RULE,
        CREDENTIAL_RULE,
        SECOND_PERSON_RULE,
        banned,
      );
      break;
    case 'talking_point':
      blocks.push(
        KILL_RULE,
        `Otherwise answer: {"talking_point": {"id": string, "text": string, "is_product": boolean, "claim_id": string | null, "feature_id": string | null, "overlay_label": string}}`,
        `Regenerate ONLY the talking point at the index named in the message. Keep its id. Do not duplicate or contradict the other points; they stay exactly as given. If it is the is_product point, it stays the plug point: keep its claim_id and compose the plug sentence from that approved claim (the same sentence stays in cta, so keep it a single plug sentence riding with the point's advice).`,
        POINT_RULES,
        FEATURE_ID_RULE,
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
  if (brand.features.length) {
    docBlocks.push(
      `Feature library (pick feature_id per product talking point; null when the point is not about a specific feature):\n${brand.features
        .map(
          (f) =>
            `- feature_id ${f.id}: ${f.name}${f.sentence ? ` — ${f.sentence}` : ''} (${f.screenshots.length} screenshot${f.screenshots.length === 1 ? '' : 's'})`,
        )
        .join('\n')}`,
    );
  } else {
    docBlocks.push('Feature library: empty. Set feature_id null on every talking point.');
  }
  docBlocks.push(
    brand.hashtagBank.length
      ? `Hashtag bank (pick 3 to 5): ${brand.hashtagBank.join(' ')}`
      : 'Hashtag bank: empty.',
  );
  const learned = learningBlocks(brand.learnings);
  if (learned) docBlocks.push(learned);
  return docBlocks;
}

/**
 * Rules distilled from how this team (and every team) edited AI posts before
 * publishing. Company rules first; each carries at most one before/after pair
 * so the model sees the correction, not just the rule.
 */
export function learningBlocks(learnings: BrandContext['learnings']): string | null {
  if (!learnings.length) return null;
  const line = (l: BrandContext['learnings'][number]) => {
    const example = l.examples[0];
    const pair = example
      ? `\n    AI wrote: ${example.before}\n    Manager published: ${example.after}`
      : '';
    return `- [${l.category}] ${l.insight} (seen ${l.evidence_count}x)${pair}`;
  };
  const own = learnings.filter((l) => l.company_id !== null);
  const global = learnings.filter((l) => l.company_id === null);
  const parts: string[] = [
    'LEARNED FROM MANAGER EDITS. These are corrections managers made to previous AI posts before publishing. Apply them so the next post needs fewer edits. Team rules outrank general rules.',
  ];
  if (own.length) parts.push(`This team:\n${own.map(line).join('\n')}`);
  if (global.length) parts.push(`Across all teams:\n${global.map(line).join('\n')}`);
  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// Normalization

type RawPoint = {
  id?: string;
  text: string | null;
  is_product: boolean;
  claim_id?: string | null;
  feature_id?: string | null;
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
  // Feature library ids per point, index-aligned; null when not about a
  // feature or when the model named an id outside the loaded library.
  featureIds: (string | null)[];
};

export type PointMedia = {
  feature_id: string | null;
  screenshot_url: string | null;
  shape: 'phone' | 'laptop' | null;
  /** Labeled media_library pick; wins over the feature screenshot when set. */
  library_path?: string;
  library_kind?: 'screenshot' | 'recording';
};

type LibraryRow = { id: string; kind: 'screenshot' | 'recording'; path: string; title: string };

const MEDIA_MATCH_SYSTEM = `You attach on-screen media to the talking points of a short social video or slideshow. You get the company's media library (screen recordings and screenshots, each with a title the manager wrote) and the talking points in order. Pick, for each talking point, the one library item whose title clearly shows what that point talks about. Rules: a point with is_product true is the product plug and must get an item when any item shows the product; other points get an item only on a clear title match; use each item at most once; never invent indexes. Answer ONLY with JSON: {"picks": [{"point_index": number, "media_index": number}]}. An empty picks array is a valid answer.`;

/**
 * Asks Claude to match labeled library media to talking points and layers
 * the picks over the feature screenshots. Untitled media is never offered.
 * Any failure falls back to the feature screenshots alone.
 */
export async function resolvePointMedia(
  admin: SupabaseClient,
  companyId: string,
  features: BrainFeature[],
  featureIds: (string | null)[],
  points: TalkingPoint[],
): Promise<(PointMedia | null)[]> {
  const base = buildPointMedia(features, featureIds);
  const { data } = await admin
    .from('media_library')
    .select('id, kind, path, title')
    .eq('company_id', companyId)
    .not('title', 'is', null)
    .order('created_at', { ascending: false });
  const library = ((data ?? []) as LibraryRow[]).filter((r) => r.title.trim().length > 0);
  if (library.length === 0 || points.length === 0) return base;

  const user = [
    `Media library:\n${library.map((m, i) => `- media_index ${i} (${m.kind}): ${m.title.trim()}`).join('\n')}`,
    `Talking points:\n${points.map((p, i) => `- point_index ${i}${p.is_product ? ' [is_product]' : ''}: ${p.text}`).join('\n')}`,
  ].join('\n\n');

  let picks: { point_index: number; media_index: number }[] = [];
  try {
    const raw = await askClaude(MEDIA_MATCH_SYSTEM, user, 512);
    const parsed = parseClaudeJson<{ picks?: unknown }>(raw);
    if (Array.isArray(parsed.picks)) {
      picks = parsed.picks.filter(
        (p): p is { point_index: number; media_index: number } =>
          typeof p === 'object' && p !== null &&
          Number.isInteger((p as { point_index?: unknown }).point_index) &&
          Number.isInteger((p as { media_index?: unknown }).media_index),
      );
    }
  } catch {
    return base;
  }

  const used = new Set<number>();
  for (const pick of picks) {
    const item = library[pick.media_index];
    if (!item || used.has(pick.media_index)) continue;
    if (pick.point_index < 0 || pick.point_index >= points.length) continue;
    used.add(pick.media_index);
    const prior = base[pick.point_index];
    base[pick.point_index] = {
      feature_id: prior?.feature_id ?? null,
      screenshot_url: prior?.screenshot_url ?? null,
      shape: prior?.shape ?? null,
      library_path: item.path,
      library_kind: item.kind,
    };
  }
  return base;
}

export function sanitizeFeatureId(
  value: unknown,
  knownFeatureIds: ReadonlySet<string>,
): string | null {
  return typeof value === 'string' && knownFeatureIds.has(value) ? value : null;
}

/**
 * One entry per point. Phone screenshots come first; points sharing a
 * feature walk through its screenshots in order and cycle.
 */
export function buildPointMedia(
  features: BrainFeature[],
  featureIds: (string | null)[],
): (PointMedia | null)[] {
  const byId = new Map(features.map((f) => [f.id, f]));
  const usedPerFeature = new Map<string, number>();
  return featureIds.map((id) => {
    if (!id) return null;
    const feature = byId.get(id);
    if (!feature) return { feature_id: id, screenshot_url: null, shape: null };
    const ordered = [
      ...feature.screenshots.filter((s) => s.shape === 'phone'),
      ...feature.screenshots.filter((s) => s.shape !== 'phone'),
    ];
    if (ordered.length === 0) return { feature_id: id, screenshot_url: null, shape: null };
    const used = usedPerFeature.get(id) ?? 0;
    usedPerFeature.set(id, used + 1);
    const shot = ordered[used % ordered.length];
    return { feature_id: id, screenshot_url: shot.url, shape: shot.shape };
  });
}

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
  knownFeatureIds: ReadonlySet<string> = new Set(),
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
  const featureIds = rawPoints.map((p) => sanitizeFeatureId(p.feature_id, knownFeatureIds));
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
    featureIds,
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
