// Review scoring and the Tier 2/3 model calls for brief-review. Server only:
// the client re-runs Tier 1 via validateBrief.ts (import-free) but never
// touches this module. Tier 1 is deterministic (runTier1Checks). Tier 2 is
// one structural model call. Tier 3 is one question: does this read as
// spoken or as written, boolean plus the single worst line.

import type {
  BriefDraftShape,
  ReviewCheck,
  ReviewSuggestion,
  TalkingPoint,
} from './validateBrief.ts';

export type ReviewScores = {
  overall: number;
  hook: number;
  talking_points: number;
  cta: number;
};

export type Tier3Result = {
  spoken: boolean;
  worst_line: string | null;
};

// Deductions per fired check. Review never blocks, so the score only has to
// rank problems, not gate anything.
const DEDUCTION: Record<string, number> = {
  '1:fail': 25,
  '1:warn': 10,
  '2:warn': 15,
  '3:warn': 20,
};

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function scoreReview(checks: ReviewCheck[]): ReviewScores {
  const deduct = (section: string) =>
    checks
      .filter((c) => c.section === section)
      .reduce((sum, c) => sum + (DEDUCTION[`${c.tier}:${c.severity}`] ?? 10), 0);
  const hook = clamp(100 - deduct('hook'));
  const talkingPoints = clamp(100 - deduct('talking_points'));
  const cta = clamp(100 - deduct('cta'));
  // Caption and whole-post checks land on the overall score at half weight so
  // one caption nit does not swing it as hard as a section problem.
  const overall = clamp(
    (hook + talkingPoints + cta) / 3 - deduct('caption') / 2 - deduct('overall'),
  );
  return { overall, hook, talking_points: talkingPoints, cta };
}

function parsePoints(value: unknown): TalkingPoint[] {
  if (!Array.isArray(value)) return [];
  const points: TalkingPoint[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const raw = entry as Record<string, unknown>;
    points.push({
      id: typeof raw.id === 'string' ? raw.id : String(points.length + 1),
      text: typeof raw.text === 'string' ? raw.text : null,
      is_product: raw.is_product === true,
      edited_by_admin: raw.edited_by_admin === true,
      claim_id: typeof raw.claim_id === 'string' ? raw.claim_id : null,
    });
  }
  return points;
}

/** Tolerant read of the editor's current draft state. Same shape brief-assist reads. */
export function parseReviewDraft(raw: Record<string, unknown>): BriefDraftShape {
  const points = parsePoints(raw.talking_points);
  return {
    title: typeof raw.title === 'string' ? raw.title : '',
    search_phrase:
      typeof raw.search_phrase === 'string' && raw.search_phrase.trim()
        ? raw.search_phrase.trim()
        : null,
    format: raw.format === 'photo_carousel' ? 'photo_carousel' : 'video',
    point_count:
      typeof raw.point_count === 'number' ? raw.point_count : points.length,
    target_words: typeof raw.target_words === 'number' ? raw.target_words : 380,
    hook_options: Array.isArray(raw.hook_options)
      ? raw.hook_options.filter((h): h is string => typeof h === 'string')
      : [],
    talking_points: points,
    cta: typeof raw.cta === 'string' && raw.cta.trim() ? raw.cta.trim() : null,
    caption: typeof raw.caption === 'string' ? raw.caption : '',
    hashtags: Array.isArray(raw.hashtags)
      ? raw.hashtags.filter((h): h is string => typeof h === 'string')
      : [],
    why_it_works: typeof raw.why_it_works === 'string' ? raw.why_it_works : '',
    script: typeof raw.script === 'string' && raw.script.trim() ? raw.script : null,
  };
}

function draftBlock(draft: BriefDraftShape, chosenHook: string | null): string {
  return [
    `Search phrase the post must deliver on: ${draft.search_phrase ?? '(none)'}`,
    `Hook: ${chosenHook ?? draft.hook_options[0] ?? '(none)'}`,
    `Spoken lines, in order:\n${draft.talking_points
      .map((p, i) => `[${i}]${p.is_product ? ' (product plug)' : ''} ${p.text ?? '(empty)'}`)
      .join('\n')}`,
    `Plug sentence: ${draft.cta ?? '(none)'}`,
    `Caption: ${draft.caption || '(none)'}`,
    ...(draft.script ? [`Slide copy:\n${draft.script}`] : []),
  ].join('\n\n');
}

// --- Tier 2: one structural call -------------------------------------------

export const TIER2_SYSTEM = [
  'You review one short-form social post script for structural tells that AI wrote it.',
  'Check exactly four things:',
  '1. dialogue: more than one speaker is implied anywhere in the spoken lines.',
  '2. symmetry: balanced symmetrical clauses ("not X, but Y", "it isn\'t A, it\'s B", mirrored halves).',
  '3. parallel_list: a three-item parallel list inside one sentence ("fast, easy, and cheap").',
  '4. search_promise: the post does NOT deliver what the search phrase promises (fire when it fails to deliver).',
  'For each fired check quote the offending line as evidence and, except for search_promise, offer one rewritten replacement that keeps the meaning and reads as one person talking.',
  'Suggestions target a field: {"field":"talking_point","index":N,"replacement":"..."} for spoken lines, {"field":"hook","replacement":"..."} for the hook, {"field":"caption","replacement":"..."} for the caption.',
  'Return ONLY JSON:',
  '{"dialogue":{"fired":bool,"evidence":string|null,"suggestion":object|null},"symmetry":{...same},"parallel_list":{...same},"search_promise":{"fired":bool,"evidence":string|null}}',
].join('\n');

export function buildTier2User(draft: BriefDraftShape, chosenHook: string | null): string {
  return draftBlock(draft, chosenHook);
}

type RawTier2Item = {
  fired?: boolean;
  evidence?: string | null;
  suggestion?: {
    field?: string;
    index?: number;
    replacement?: string;
  } | null;
};

type RawTier2 = {
  dialogue?: RawTier2Item;
  symmetry?: RawTier2Item;
  parallel_list?: RawTier2Item;
  search_promise?: RawTier2Item;
};

const SUGGESTION_FIELDS: ReviewSuggestion['field'][] = [
  'hook',
  'talking_point',
  'cta',
  'caption',
  'search_phrase',
];

function toSuggestion(raw: RawTier2Item['suggestion']): ReviewSuggestion | undefined {
  if (!raw || typeof raw.replacement !== 'string' || !raw.replacement.trim()) {
    return undefined;
  }
  const field = SUGGESTION_FIELDS.find((f) => f === raw.field);
  if (!field) return undefined;
  return {
    field,
    ...(typeof raw.index === 'number' ? { index: raw.index } : {}),
    replacement: raw.replacement.trim(),
  };
}

export function parseTier2(raw: RawTier2): ReviewCheck[] {
  const checks: ReviewCheck[] = [];
  const add = (
    item: RawTier2Item | undefined,
    check_id: string,
    section: ReviewCheck['section'],
    label: string,
  ) => {
    if (!item?.fired) return;
    const evidence = typeof item.evidence === 'string' && item.evidence.trim()
      ? `: "${item.evidence.trim()}"`
      : '';
    checks.push({
      check_id,
      tier: 2,
      section,
      severity: 'warn',
      message: `${label}${evidence}`,
      ...(toSuggestion(item.suggestion) ? { suggestion: toSuggestion(item.suggestion) } : {}),
    });
  };
  add(raw.dialogue, 'dialogue_implied', 'talking_points', 'more than one speaker implied');
  add(raw.symmetry, 'symmetrical_clauses', 'talking_points', 'balanced symmetrical clauses');
  add(raw.parallel_list, 'parallel_list', 'talking_points', 'three-item parallel list in one sentence');
  add(raw.search_promise, 'search_promise_unmet', 'overall', 'the post does not deliver what the search phrase promises');
  return checks;
}

// --- Tier 3: spoken or written ----------------------------------------------

export const TIER3_SYSTEM = [
  'You read one short-form social post script. Answer one question only:',
  'does this read as SPOKEN, like one person talking to a friend, or as WRITTEN copy?',
  'Return ONLY JSON: {"spoken":bool,"worst_line":string|null}',
  'worst_line is the single most written-sounding line, quoted verbatim. Null when spoken is true.',
].join('\n');

export function buildTier3User(draft: BriefDraftShape, chosenHook: string | null): string {
  return draftBlock(draft, chosenHook);
}

type RawTier3 = { spoken?: boolean; worst_line?: string | null };

export function parseTier3(raw: RawTier3): { result: Tier3Result; checks: ReviewCheck[] } {
  const spoken = raw.spoken !== false;
  const worstLine =
    typeof raw.worst_line === 'string' && raw.worst_line.trim()
      ? raw.worst_line.trim()
      : null;
  const result: Tier3Result = { spoken, worst_line: spoken ? null : worstLine };
  const checks: ReviewCheck[] = spoken
    ? []
    : [
        {
          check_id: 'reads_as_written',
          tier: 3,
          section: 'overall',
          severity: 'warn',
          message: worstLine
            ? `reads as written, not spoken. Worst line: "${worstLine}"`
            : 'reads as written, not spoken',
        },
      ];
  return { result, checks };
}
