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
  // Screenplay-style speaker labels at line starts: "Coach:", "Me:", "Her:".
  /^\s*[A-Z][a-z]{1,12}:\s+\S/m,
];

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

export function runTier1Checks(
  draft: BriefDraftShape,
  ctx: {
    hashtagBank: string[];
    approvedClaimIds: string[];
    postType?: PostTypeShape | null;
  },
): ReviewCheck[] {
  const checks: ReviewCheck[] = [];
  const postType = ctx.postType ?? null;
  const fail = (check_id: string, section: ReviewSection, message: string) =>
    checks.push({ check_id, tier: 1, section, severity: 'fail', message });
  const warn = (check_id: string, section: ReviewSection, message: string) =>
    checks.push({ check_id, tier: 1, section, severity: 'warn', message });

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

  if (draft.talking_points.length !== draft.point_count) {
    fail(
      'point_count_mismatch',
      'talking_points',
      `talking_points length ${draft.talking_points.length} does not equal point_count ${draft.point_count}`,
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
  // replay_bait); type-less legacy drafts keep it required.
  const requiresPlug = postType ? postType.requires_plug : true;
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
      if (index === 0 || index === last) {
        fail(
          'plug_position',
          'cta',
          `product point at index ${index}; it must never be first or last`,
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
        if (!claimId || !ctx.approvedClaimIds.includes(claimId)) {
          fail(
            'plug_claim_untraceable',
            'cta',
            'product point is not traceable to an approved claim id; set claim_id to an approved claim',
          );
        }
        if (!draft.cta?.trim()) {
          fail('cta_missing', 'cta', 'cta is empty; it must hold the one plug sentence');
        } else if (
          !normalizePhrase(product.text).includes(normalizePhrase(draft.cta))
        ) {
          fail(
            'cta_not_embedded',
            'cta',
            'cta must be the exact plug sentence embedded in the is_product talking point',
          );
        }
      }
    }
  } else {
    if (productPoints.length > 0) {
      fail(
        'plug_forbidden',
        'cta',
        `${postType?.key ?? 'this type'} takes no plug; remove the is_product point`,
      );
    }
    if (draft.cta?.trim()) {
      fail(
        'cta_forbidden',
        'cta',
        `${postType?.key ?? 'this type'} takes no plug; cta must be null`,
      );
    }
  }

  const bank = new Set(ctx.hashtagBank.map(normalizeTag));
  if (draft.hashtags.length < 3 || draft.hashtags.length > 5) {
    fail('hashtag_count', 'caption', `expected 3 to 5 hashtags, got ${draft.hashtags.length}`);
  }
  const offBank = draft.hashtags.filter((t) => !bank.has(normalizeTag(t)));
  if (offBank.length > 0) {
    fail('hashtag_off_bank', 'caption', `hashtags not in hashtag_bank: ${offBank.join(', ')}`);
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
    if (point.text && wordCount(point.text) > 25) {
      warn('point_over_25_words', 'talking_points', `talking point over 25 words: "${point.text}"`);
    }
  }

  const phrase = draft.search_phrase?.trim() ?? '';
  if (!phrase) {
    warn('search_phrase_missing', 'caption', 'no search phrase set; the post has nothing to rank for');
  } else if (
    !normalizePhrase(firstSentence(draft.caption)).includes(normalizePhrase(phrase))
  ) {
    warn(
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
  },
): ValidationResult {
  const checks = runTier1Checks(draft, ctx);
  const failures = checks.filter((c) => c.severity === 'fail').map((c) => c.message);
  const warnings = checks.filter((c) => c.severity === 'warn').map((c) => c.message);
  return { passed: failures.length === 0, failures, warnings };
}
