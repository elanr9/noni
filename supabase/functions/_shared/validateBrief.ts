// Brief draft validator. Runs on every generated draft before it returns and
// again as Tier 1 of the admin review step. Checks are emitted structured
// (runTier1Checks) so the review UI can score and log overrides per check;
// validateBrief() derives the old failures/warnings string API from them.
// Hard failures trigger one generation retry; soft warnings ride along.
// Plug and length rules come from the post_types row when one is given; the
// type-less legacy paths keep the old defaults (plug required, no length
// check). This module must stay import-free: the client bundles it too.

export type TalkingPoint = {
  id: string;
  text: string | null;
  is_product: boolean;
  edited_by_admin: boolean;
  // Which approved product_features row the plug sentence was composed from.
  claim_id?: string | null;
  // True when the creator reads this point word for word from the teleprompter.
  // Unset or false shows it as a talking hint.
  script?: boolean;
};

export type BriefDraftShape = {
  title: string;
  search_phrase: string | null;
  format: 'video' | 'photo_carousel';
  point_count: number;
  target_words: number;
  hook_options: string[];
  talking_points: TalkingPoint[];
  // The plug: one sentence, also embedded verbatim in the is_product point.
  cta: string | null;
  caption: string;
  hashtags: string[];
  why_it_works: string;
  script: string | null;
};

export type PostTypeShape = {
  key: string;
  family: 'video' | 'photo_carousel';
  min_points: number;
  max_points: number;
  requires_plug: boolean;
  target_words_min: number | null;
  target_words_max: number | null;
};

export type ValidationResult = {
  passed: boolean;
  failures: string[];
  warnings: string[];
};

export type ReviewSection =
  | 'hook'
  | 'talking_points'
  | 'cta'
  | 'caption'
  | 'overall';

export type ReviewSuggestion = {
  field: 'hook' | 'talking_point' | 'cta' | 'caption' | 'search_phrase';
  // Index into talking_points when field is talking_point.
  index?: number;
  replacement: string;
};

export type ReviewCheck = {
  check_id: string;
  tier: 1 | 2 | 3;
  section: ReviewSection;
  severity: 'fail' | 'warn';
  message: string;
  suggestion?: ReviewSuggestion;
};

const MULTI_SPEAKER_PATTERNS: RegExp[] = [
  /\bwait,?\s*what\b/i,
  /\bso you'?re telling me\b/i,
  // Quoted dialogue with attribution: "..." he said / she asked / they replied.
  /["\u201c][^"\u201d]+["\u201d]\s*,?\s*\b(he|she|they)\s+(said|says|asked|asks|replied|replies)\b/i,
];

// Screenplay-style speaker labels at line starts: "Coach:", "Me:", "Her:".
// Timeline and step labels ("Fall:", "September:", "Step:") are not speakers.
const SPEAKER_LABEL = /^\s*([A-Z][a-z]{1,12}):\s+\S/gm;
const NON_SPEAKER_LABELS = new Set([
  'fall', 'winter', 'spring', 'summer', 'january', 'february', 'march', 'april',
  'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'step', 'week', 'day', 'month', 'year', 'first', 'second', 'third', 'fourth',
  'fifth', 'last', 'morning', 'night', 'before', 'after', 'freshman', 'sophomore',
  'junior', 'senior', 'subject', 'body', 'close', 'note', 'example', 'tip',
]);

function hasSpeakerLabel(text: string): boolean {
  for (const match of text.matchAll(SPEAKER_LABEL)) {
    if (!NON_SPEAKER_LABELS.has(match[1].toLowerCase())) return true;
  }
  return false;
}

// Hook openers a viewer would never screenshot as a title card.
const BANNED_HOOK_SHAPE = /^\s*(how to\b|tips for\b|here('s| is| are) (how|some|a few)\b|let'?s talk about\b|in this video\b|today (i|we)('m| am|'re| are)\b)/i;

const HOOK_ABSOLUTES = /\b(will|never|stop|every|only|always|before|until|exactly|one|wrong|worst|secret)\b/i;

/** A digit, an absolute, or a capitalised named thing after the first word. */
function hasHookMarker(hook: string): boolean {
  if (/\d/.test(hook) || HOOK_ABSOLUTES.test(hook)) return true;
  const afterFirstWord = hook.trim().split(/\s+/).slice(1);
  return afterFirstWord.some((w) => /^[A-Z][a-zA-Z0-9]+$/.test(w.replace(/[^a-zA-Z0-9]/g, '')) && w !== w.toUpperCase());
}

const NUMBER_WORD = /\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|hundred|thousand|half|double|twice)\b/i;

// Imperatives that mark a step, not a moral.
const INSTRUCTION_OPENER = /^\s*(?:then\s+|so\s+|and\s+)?(end|send|email|lock|type|keep|start|follow|build|cut|use|make|add|ask|write|put|close|include|attach|reach|call|text|link|post|tag|check|update|pick|choose|go|get|stop|wait|expect|schedule|book|visit|record|film|upload|search)\b/i;

/** "send them for me" dangles; "draft my emails so coaches read them" has its noun. */
function hasDanglingPronoun(cta: string): boolean {
  const trimmed = cta.trim();
  const ending = /\b(them|it|this|that|those|these)\s*(for me|for you)?[.!?]?\s*$/i.exec(trimmed);
  if (!ending) return false;
  const before = trimmed.slice(0, ending.index);
  return !/\b(my|the|your|our|every|each|a|an)\s+[a-z]+/i.test(before);
}

const STOP_WORDS = new Set(['for', 'the', 'a', 'an', 'to', 'in', 'of', 'on', 'my', 'your', 'and', 'with', 'at']);

/** Phrase containment that ignores filler, so "timeline for junior year" still holds "timeline junior year". */
function containsPhrase(haystack: string, phrase: string): boolean {
  const strip = (s: string) =>
    normalizePhrase(s).split(' ').filter((w) => w && !STOP_WORDS.has(w)).join(' ');
  const h = strip(haystack);
  const p = strip(phrase);
  return p.length === 0 || h.includes(p);
}

function lastSentence(text: string): string {
  const cleaned = text.replace(/\[[^\]]*\]/g, ' ').trim();
  const parts = (cleaned.match(/[^.!?:;]+/g) ?? [cleaned]).map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? cleaned;
}

const HEDGE_WORDS = [
  'really',
  'truly',
  'actually',
  'honestly',
  'simply',
  'just',
  'very',
];

// Lexicon for the double-adjective heuristic. Suffix matching covers the
// derived forms; short common adjectives need explicit entries.
const COMMON_ADJECTIVES = new Set([
  'quick', 'easy', 'fast', 'slow', 'big', 'small', 'tiny', 'huge', 'new',
  'old', 'good', 'great', 'bad', 'best', 'worst', 'real', 'true', 'simple',
  'clean', 'clear', 'cheap', 'free', 'fresh', 'full', 'empty', 'hard',
  'soft', 'high', 'low', 'long', 'short', 'deep', 'hot', 'cold', 'warm',
  'cool', 'dark', 'light', 'strong', 'weak', 'rich', 'smart', 'crazy',
  'weird', 'wild', 'calm', 'busy', 'tasty', 'sweet', 'smooth', 'rough',
  'tight', 'loose', 'thick', 'thin', 'heavy', 'pretty', 'nice', 'fine',
  'solid', 'perfect', 'whole', 'entire', 'major', 'minor', 'extra', 'basic',
  'modern', 'classic', 'natural', 'common', 'rare', 'secret', 'hidden',
  'instant', 'daily', 'weekly', 'healthy', 'lazy', 'happy',
]);

const ADJECTIVE_SUFFIX = /(ous|ful|ive|able|ible|less|ish)$/;

function isAdjectiveLike(word: string): boolean {
  const w = word.toLowerCase();
  return COMMON_ADJECTIVES.has(w) || (w.length > 5 && ADJECTIVE_SUFFIX.test(w));
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/^#/, '');
}

function normalizePhrase(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function leadingTitleCount(title: string): number | null {
  const match = /^\s*(\d{1,2})(?=[\s:.\-–—])/.exec(title);
  if (!match) return null;
  const count = Number(match[1]);
  return count >= 2 && count <= 10 ? count : null;
}

function spokenText(draft: BriefDraftShape): string {
  const points = draft.talking_points
    .map((p) => p.text ?? '')
    .filter(Boolean)
    .join(' ');
  return [draft.hook_options.join(' '), points, draft.script ?? '']
    .filter(Boolean)
    .join(' ');
}

function firstSentence(text: string): string {
  const match = text.match(/^[^.!?]+/);
  return (match ? match[0] : text).trim();
}

/** Consecutive adjective pairs stacked on one noun, e.g. "quick easy fix". */
function doubleAdjectivePhrases(text: string): string[] {
  const tokens = text.split(/\s+/).map((t) => t.replace(/^[^a-zA-Z']+|[^a-zA-Z']+$/g, ''));
  const phrases: string[] = [];
  for (let i = 0; i < tokens.length - 2; i++) {
    if (
      tokens[i] &&
      tokens[i + 1] &&
      tokens[i + 2] &&
      isAdjectiveLike(tokens[i]) &&
      isAdjectiveLike(tokens[i + 1]) &&
      !isAdjectiveLike(tokens[i + 2])
    ) {
      phrases.push(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
    }
  }
  return phrases;
}

/** The plug must land while retention is still high: first half of the points, never last. */
export function lastAllowedPlugIndex(pointCount: number): number {
  return Math.max(0, Math.floor((pointCount - 1) / 2));
}

function mentionsAny(text: string, names: string[]): boolean {
  const haystack = normalizePhrase(text);
  return names.some((name) => {
    const needle = normalizePhrase(name);
    return needle.length > 0 && haystack.includes(needle);
  });
}

export function runTier1Checks(
  draft: BriefDraftShape,
  ctx: {
    hashtagBank: string[];
    approvedClaimIds: string[];
    postType?: PostTypeShape | null;
    /** Names the plug may use for the product; empty skips the name check. */
    productNames?: string[];
    /** Words or phrases the manager banned (a feature the product does not have); a hard fail wherever they appear. */
    bannedPhrases?: string[];
  },
): ReviewCheck[] {
  const checks: ReviewCheck[] = [];
  const postType = ctx.postType ?? null;
  const productNames = (ctx.productNames ?? []).filter((n) => n.trim().length > 0);
  const fail = (check_id: string, section: ReviewSection, message: string) =>
    checks.push({ check_id, tier: 1, section, severity: 'fail', message });
  const warn = (check_id: string, section: ReviewSection, message: string) =>
    checks.push({ check_id, tier: 1, section, severity: 'warn', message });

  // --- Manager bans: absolute, every field ---------------------------------
  const banned = (ctx.bannedPhrases ?? []).map((b) => b.trim()).filter((b) => b.length > 1);
  if (banned.length) {
    const fields: Array<[string, ReviewSection, string | null]> = [
      ['title', 'hook', draft.title],
      ['cta', 'cta', draft.cta],
      ['caption', 'caption', draft.caption],
      ['script', 'talking_points', draft.script],
      ...draft.hook_options.map((h, i): [string, ReviewSection, string | null] => [`hook option ${i + 1}`, 'hook', h]),
      ...draft.talking_points.map((p, i): [string, ReviewSection, string | null] => [`talking point ${i + 1}`, 'talking_points', p.text]),
    ];
    for (const phrase of banned) {
      const re = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      for (const [name, section, text] of fields) {
        if (text && re.test(text)) {
          fail(
            'banned_phrase',
            section,
            `${name} says "${phrase}", which the manager banned (the product does not have it or never says it); rewrite that line without it and without a synonym for it`,
          );
        }
      }
    }
  }

  // --- Hard fails -----------------------------------------------------------

  const speakable = spokenText(draft);
  for (const pattern of MULTI_SPEAKER_PATTERNS) {
    if (pattern.test(speakable)) {
      fail(
        'multi_speaker',
        'talking_points',
        `more than one speaker implied (matched ${pattern.source.slice(0, 40)}); single speaker only, no dialogue`,
      );
      break;
    }
  }
  if (hasSpeakerLabel(speakable)) {
    fail(
      'multi_speaker',
      'talking_points',
      'a line starts with a speaker label like "Coach:"; single speaker only, no dialogue',
    );
  }

  if (draft.talking_points.length !== draft.point_count) {
    fail(
      'point_count_mismatch',
      'talking_points',
      `talking_points length ${draft.talking_points.length} does not equal point_count ${draft.point_count}`,
    );
  }
  const titleCount = leadingTitleCount(draft.title);
  if (titleCount !== null && draft.talking_points.length !== titleCount) {
    fail(
      'point_count_source_mismatch',
      'talking_points',
      `title leads with ${titleCount} but talking_points has ${draft.talking_points.length} entries; the count must match the number the title promises`,
    );
  }
  if (
    postType &&
    (draft.talking_points.length < postType.min_points ||
      draft.talking_points.length > postType.max_points)
  ) {
    fail(
      'point_count_type_range',
      'talking_points',
      `${draft.talking_points.length} talking points; ${postType.key} takes ${postType.min_points} to ${postType.max_points}`,
    );
  }

  // Plug. The requirement lives on the post_types row (false only on
  // replay_bait); type-less legacy drafts keep it required. With no approved
  // claims the plug is composed from product truth, so only traceability is skipped.
  const requiresPlug = postType ? postType.requires_plug : true;
  const hasClaims = ctx.approvedClaimIds.length > 0;
  const productPoints = draft.talking_points.filter((p) => p.is_product);
  if (requiresPlug) {
    if (productPoints.length !== 1) {
      fail(
        'plug_count',
        'cta',
        `expected exactly one is_product talking point, got ${productPoints.length}`,
      );
    } else {
      const index = draft.talking_points.findIndex((p) => p.is_product);
      const last = draft.talking_points.length - 1;
      const lastAllowed = lastAllowedPlugIndex(draft.talking_points.length);
      if (draft.talking_points.length > 1 && (index === last || index > lastAllowed)) {
        fail(
          'plug_position',
          'cta',
          `product point at index ${index}; the plug lands early, at index 0 to ${lastAllowed}, never last`,
        );
      }
      const product = productPoints[0];
      if (!product.text) {
        fail(
          'plug_empty',
          'cta',
          'product point has no text; kill the brief instead of padding',
        );
      } else {
        const claimId = product.claim_id ?? null;
        if (hasClaims && (!claimId || !ctx.approvedClaimIds.includes(claimId))) {
          fail(
            'plug_claim_untraceable',
            'cta',
            'product point is not traceable to an approved claim id; set claim_id to an approved claim',
          );
        }
        if (draft.cta?.trim()) {
          // Only words before the plug sentence count; the nudge after it is not advice.
          const normalizedPoint = normalizePhrase(product.text);
          const ctaAt = normalizedPoint.indexOf(normalizePhrase(draft.cta));
          const beat = ctaAt > 0 ? normalizedPoint.slice(0, ctaAt) : '';
          const adviceWords = wordCount(beat);
          if (adviceWords < 8) {
            fail(
              'plug_no_advice',
              'cta',
              `the plug point opens with ${adviceWords} words of advice before the plug sentence; it needs an advice beat of 8 to 15 words first (what the viewer does), then the plug, then the nudge`,
            );
          } else if (productNames.length > 0 && mentionsAny(beat, productNames)) {
            fail(
              'plug_beat_names_product',
              'cta',
              `the advice beat before the plug already names ${productNames[0]}; the beat is what the viewer does by hand, the product appears only in the plug sentence and the nudge`,
            );
          }
        }
        if (/[\[\]]/.test(product.text)) {
          fail(
            'plug_bracketed',
            'cta',
            'the plug point carries a bracketed creator nudge; the plug is said as written, move the nudge to another point',
          );
        }
        if (!draft.cta?.trim()) {
          fail('cta_missing', 'cta', 'cta is empty; it must hold the one plug sentence');
        } else if (
          wordCount(draft.cta) > 22 ||
          wordCount(draft.cta) < 8 ||
          /[:;]/.test(draft.cta) ||
          /[.!?]\s+\S/.test(draft.cta.trim()) ||
          hasDanglingPronoun(draft.cta)
        ) {
          fail(
            'cta_shape',
            'cta',
            `cta must be one complete sentence of 8 to 22 words that makes sense read alone, no colon or semicolon, no dangling pronoun like "send them for me": "${draft.cta}"`,
          );
        } else if (
          !normalizePhrase(product.text).includes(normalizePhrase(draft.cta))
        ) {
          fail(
            'cta_not_embedded',
            'cta',
            'cta must be the exact plug sentence embedded in the is_product talking point',
          );
        } else if (productNames.length > 0 && !mentionsAny(draft.cta, productNames)) {
          fail(
            'plug_names_product',
            'cta',
            `the plug sentence never says the product name; it must name ${productNames[0]} out loud`,
          );
        }
      }
    }
  } else {
    const reason = `${postType?.key ?? 'this type'} takes no plug`;
    if (productPoints.length > 0) {
      fail('plug_forbidden', 'cta', `${reason}; remove the is_product point`);
    }
    if (draft.cta?.trim()) {
      fail('cta_forbidden', 'cta', `${reason}; cta must be null`);
    }
  }

  // Hard word budgets: the soft warning alone was ignored on every run.
  for (const point of draft.talking_points) {
    if (!point.text) continue;
    const words = wordCount(point.text);
    const hardCap = point.is_product ? 45 : 30;
    if (words > hardCap) {
      fail(
        point.is_product ? 'plug_over_45_words' : 'point_over_30_words',
        'talking_points',
        `${point.is_product ? 'plug point' : 'talking point'} is ${words} words, over the hard cap of ${hardCap}; compress it: "${point.text}"`,
      );
    }
  }

  const bank = new Set(ctx.hashtagBank.map(normalizeTag));
  if (draft.hashtags.length < 3 || draft.hashtags.length > 5) {
    fail('hashtag_count', 'caption', `expected 3 to 5 hashtags, got ${draft.hashtags.length}`);
  }
  // An empty bank means the team has not curated tags yet; topical picks stand.
  if (bank.size > 0) {
    const offBank = draft.hashtags.filter((t) => !bank.has(normalizeTag(t)));
    if (offBank.length > 0) {
      fail('hashtag_off_bank', 'caption', `hashtags not in hashtag_bank: ${offBank.join(', ')}`);
    }
  }

  if (BANNED_HOOK_SHAPE.test(draft.caption)) {
    fail(
      'caption_banned_opener',
      'caption',
      `caption opens like a tutorial ("${firstSentence(draft.caption)}"); open on the promise or the fear instead`,
    );
  }
  if (draft.caption.length > 200) {
    fail(
      'caption_too_long',
      'caption',
      `caption is ${draft.caption.length} chars; max 200 excluding hashtags`,
    );
  }

  if (draft.hook_options.length < 8 || draft.hook_options.length > 10) {
    fail(
      'hook_option_count',
      'hook',
      `expected 8 to 10 hook options, got ${draft.hook_options.length}`,
    );
  }
  for (const hook of draft.hook_options) {
    if (wordCount(hook) > 9) {
      fail('hook_over_9_words', 'hook', `hook option over 9 words: "${hook}"`);
    }
    if (BANNED_HOOK_SHAPE.test(hook)) {
      fail(
        'hook_banned_shape',
        'hook',
        `hook is a generic shape nobody screenshots: "${hook}"; rewrite it with a specific promise, fear, number or named thing`,
      );
    }
  }
  const markerless = draft.hook_options.filter((h) => !hasHookMarker(h));
  if (draft.hook_options.length > 0 && markerless.length > draft.hook_options.length / 2) {
    warn(
      'hooks_without_marker',
      'hook',
      `${markerless.length} of ${draft.hook_options.length} hooks carry no digit, absolute or named thing: ${markerless.map((h) => `"${h}"`).join(', ')}`,
    );
  }

  // --- Soft warnings --------------------------------------------------------

  // Length is checked only when the post type carries bounds. Null on both =
  // no check (replay_bait, carousels).
  if (
    postType &&
    postType.target_words_min !== null &&
    postType.target_words_max !== null &&
    (draft.target_words < postType.target_words_min ||
      draft.target_words > postType.target_words_max)
  ) {
    warn(
      'target_words_range',
      'talking_points',
      `target_words ${draft.target_words} is outside ${postType.target_words_min} to ${postType.target_words_max} for ${postType.key}`,
    );
  }

  const totalWords = wordCount(speakable);
  if (totalWords > 0) {
    const secondPerson =
      (speakable.match(/\byou\b|\byour\b|\byou're\b|\byours\b/gi) ?? []).length;
    const per100 = (secondPerson / totalWords) * 100;
    if (per100 < 4) {
      warn(
        'second_person_low',
        'talking_points',
        `second person density ${per100.toFixed(1)} per 100 words is under 4; talk straight at one person`,
      );
    }
    // Real posts run 5.2 to 6.2. Above 8 reads as a listicle lecturing the
    // viewer rather than someone talking.
    if (per100 > 8) {
      warn(
        'second_person_high',
        'talking_points',
        `second person density ${per100.toFixed(1)} per 100 words is over 8; real posts run 5 to 6, this reads as a lecture`,
      );
    }
  }

  const hedgeHits: string[] = [];
  for (const hedge of HEDGE_WORDS) {
    const count = (speakable.match(new RegExp(`\\b${hedge}\\b`, 'gi')) ?? []).length;
    if (count > 0) hedgeHits.push(count > 1 ? `${hedge} x${count}` : hedge);
  }
  if (hedgeHits.length > 0) {
    warn(
      'hedges',
      'talking_points',
      `hedge words in the spoken lines: ${hedgeHits.join(', ')}; cut them`,
    );
  }

  const stacked = doubleAdjectivePhrases(speakable);
  if (stacked.length > 0) {
    warn(
      'double_adjectives',
      'talking_points',
      `two or more adjectives on one noun: ${stacked.map((p) => `"${p}"`).join(', ')}; keep one`,
    );
  }

  for (const point of draft.talking_points) {
    // The plug carries the product name, the mechanism and the nudge, so it gets more room.
    const budget = point.is_product ? 40 : 25;
    if (point.text && wordCount(point.text) > budget) {
      warn(
        point.is_product ? 'plug_over_40_words' : 'point_over_25_words',
        'talking_points',
        `${point.is_product ? 'plug point' : 'talking point'} over ${budget} words: "${point.text}"`,
      );
    }
  }

  if (requiresPlug && draft.cta?.trim() && !/\b(i|my|me|i've|i'd|i'm|mine)\b/i.test(draft.cta)) {
    warn(
      'plug_not_first_person',
      'cta',
      `the plug sentence is a third person ad line: "${draft.cta}"; the creator owns the tool, start it with "I"`,
    );
  }
  if (requiresPlug && draft.cta?.trim() && ctx.approvedClaimIds.length === 0 && NUMBER_WORD.test(draft.cta)) {
    warn(
      'plug_invented_number',
      'cta',
      `the plug sentence carries a number with no approved claim behind it: "${draft.cta}"; state the mechanism, not a figure`,
    );
  }

  const lastPoint = draft.talking_points[draft.talking_points.length - 1];
  if (lastPoint?.text && draft.talking_points.length > 1 && draft.format === 'video') {
    const closing = lastSentence(lastPoint.text);
    if (wordCount(closing) > 14 || INSTRUCTION_OPENER.test(closing)) {
      fail(
        'moral_missing',
        'talking_points',
        `the post ends on "${closing}"; the final sentence must be the moral, a general truth of 12 words or fewer with no instruction verb`,
      );
    }
  }
  if (requiresPlug && productNames.length > 0 && !mentionsAny(draft.caption, productNames)) {
    warn(
      'caption_names_product',
      'caption',
      `caption never names ${productNames[0]}; it is where viewers look after hearing the plug`,
    );
  }

  const phrase = draft.search_phrase?.trim() ?? '';
  if (!phrase) {
    warn('search_phrase_missing', 'caption', 'no search phrase set; the post has nothing to rank for');
  } else if (!containsPhrase(firstSentence(draft.caption), phrase)) {
    fail(
      'search_phrase_not_in_caption',
      'caption',
      `search phrase "${phrase}" is not in the caption's first sentence`,
    );
  }

  return checks;
}

export function validateBrief(
  draft: BriefDraftShape,
  ctx: {
    hashtagBank: string[];
    approvedClaimIds: string[];
    postType?: PostTypeShape | null;
    productNames?: string[];
  },
): ValidationResult {
  const checks = runTier1Checks(draft, ctx);
  const failures = checks.filter((c) => c.severity === 'fail').map((c) => c.message);
  const warnings = checks.filter((c) => c.severity === 'warn').map((c) => c.message);
  return { passed: failures.length === 0, failures, warnings };
}
