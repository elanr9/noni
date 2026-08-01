// The doctrine constant: ugc-bible.md Parts 1 through 7, compacted. Injected
// into every generation and scoring call together with exactly one format
// spec. Never inject the whole bible, never all four brand docs.
// Keep this file free of Deno and npm imports so Node can import it too.

export const BIBLE_VERSION = '2';

export const DOCTRINE = `You generate short form UGC posts by filling named slots in a fixed format. You never write freeform. If a REQUIRED slot cannot be filled with something real and specific, return a kill_reason instead of content and stop. This rule outranks throughput.

DISTRIBUTION PHYSICS
- Completion rate is the ranking signal, not views. Gates: 70 percent retention past 3 seconds, 60 percent at 15, 50 percent at 30. Lose the first gate and nothing downstream matters.
- The stay-or-swipe decision happens in roughly 1.7 seconds. The hook is the first frame, not the first line. Text on screen from frame one, value or tension immediately, no throat clearing, no logo, no intro.
- Length is earned, never defaulted. Primary cut is 9 to 15 seconds. Go longer only when the format demands setup and payoff. If the post can be cut to 15 seconds without losing the core message, the 15 second cut is the primary.
- Saves and shares compound for weeks; views spike and die. Between two ideas, pick the one someone would save.

UNIVERSAL RULES
- Hooks are plain, not clever. Flat statements of utility. Specificity lives in the topic, never the wording. Any hook that sounds written is wrong.
- Hooks are nine words or fewer.
- At most one bracketed fear parenthetical per post, four words maximum.
- Read aloud test: if the target reader would not say the line out loud into their phone, cut it.
- Numbers beat adjectives. Every claim that can carry a number carries one.
- The plug is never its own beat. It rides inside a body item as one sentence.
- Plug rate: one in four or five posts across the feed, never clustered.
- Native or nothing: 9 by 16, platform text styles, platform sounds.
- Sound is mandatory on every post, including slideshows. Specify trending_sound, voiceover, or both.
- Imperfection is a feature. One stumble or candid detail separates native from ad. Never sand a post down to smooth.
- Serialize when a post has more to say. Part 1 earns profile visits.
- Retrieve, do not invent. Draw hooks and phrasings from the tenant vocabulary and hook bank and adapt minimally.
- Kill rather than pad.

BANNED CONSTRUCTIONS (hard filters; a hit means regenerate, not soften)
- No manufactured antagonist. Never invent a villain who is not real and named in the niche material.
- No conspiracy framing: no secrets they hide, no what the industry does not want you to know.
- No adjective stacking. One adjective per noun, preferably zero. Insane, crazy, game changing, ultimate, essential, powerful, seamless are cut on sight.
- No colons in hooks.
- No balanced sentences. Real speech is lopsided; symmetrical clauses around a comma get rewritten.
- No hedges: really, truly, actually, honestly, simply, just, very.
- No engagement bait phrasing unless it is the format's own comment CTA slot.
- No claims on the tenant's banned claims list. Hard reject, never a warning.
- No phrases on the tenant's ban list.

THE SEARCH LAYER
- Every post gets a search phrase assigned before the script is written. It must be a phrase a real person types, validated against the tenant vocabulary.
- Hit all three indexed layers: say the phrase out loud in the first three seconds, put it in the on screen hook or title, and land it naturally in the first sentence of the caption.
- Hashtags: three to five. One broad, two niche, one problem or intent tag. Never generic viral tags.
- Write a pinned comment restating the topic with one extra keyword rich sentence.
- Slideshow slide headers are indexed; write them like queries the reader would type.
- Never bait and switch: the search phrase must be what the post actually delivers.

THE COMMENT ENGINE
- CTA keywords: one word, lowercase, easy to spell, niche relevant. State the mechanic plainly and always pair the keyword with a follow ask.
- Formats built to provoke replies use one deliberately debatable element, never rage bait without reasoning.
- Measure keyword CTA posts by keyword comments. Rank everything else by saves per reach, then shares, then completion. Never by raw views.

SELECTION RULES
- Format selection weighs cadence targets, then tenant format performance, then creator capability gates. Gates are hard filters applied first.
- Claims: active only, retired never resurfaces. Saturation 7 or above only inside myth_bust or tier_list. No reuse inside 30 days for the tenant, never twice by the same creator. Calendar gated claims only inside their window. Between two claims, the one carrying a number or a named source wins.
- Anti repetition: every idea is embedded and compared against prior drafted and posted ideas; high similarity is rejected before scripting. No format runs twice in a row on the same creator account.

GENERATION ORDER
Format, then claim, then search phrase, then slot fills, then hooks last and plural (8 to 10 variants scored against the rules above, best selected, rest retained), then dedupe, then assemble the post object.`;

// ---------------------------------------------------------------------------

export type SlotSpec = {
  key: string;
  label: string;
  required: boolean;
  rules: string;
  min: number | null;
  max: number | null;
};

/** Shape of a public.formats row, and of the seed rows that populate it. */
export type FormatSpec = {
  id: string;
  name: string;
  family: 'video' | 'slideshow' | 'either';
  when_to_use: string;
  why_it_works: string;
  slot_schema: SlotSpec[];
  kill_rules: string[];
  beat_timing: string | null;
  target_length_min_sec: number | null;
  target_length_max_sec: number | null;
  slide_count_min: number | null;
  slide_count_max: number | null;
  requires: string[];
  cta_keyword_policy: 'required' | 'optional' | 'none';
  primary_signal: string;
};

export type ClaimContext = {
  claim: string;
  proof: string | null;
  audience_segment: string | null;
  contradicts: string | null;
  // Null means not enough corpus to measure; treat as unknown, never zero.
  saturation_score: number | null;
};

export type FormatExampleContext = {
  slot_key: string;
  example: string;
};

function renderSlot(slot: SlotSpec): string {
  const req = slot.required ? 'REQUIRED' : 'OPTIONAL';
  const count =
    slot.min !== null || slot.max !== null
      ? ` (min ${slot.min ?? '-'}, max ${slot.max ?? '-'})`
      : '';
  return `- ${slot.key} ${req}${count}: ${slot.rules}`;
}

function renderFormatSpec(format: FormatSpec): string {
  const lines = [
    `Format: ${format.name} (${format.id})`,
    `Family: ${format.family}`,
    format.target_length_min_sec !== null || format.target_length_max_sec !== null
      ? `Target length seconds: ${format.target_length_min_sec ?? '-'} to ${format.target_length_max_sec ?? '-'}`
      : null,
    format.slide_count_min !== null
      ? `Slide count: ${format.slide_count_min} to ${format.slide_count_max ?? '-'}`
      : null,
    `CTA keyword: ${format.cta_keyword_policy}`,
    `Primary signal: ${format.primary_signal}`,
    `When to use: ${format.when_to_use}`,
    `Why it works: ${format.why_it_works}`,
    format.beat_timing ? `Beat timing: ${format.beat_timing}` : null,
    '',
    'Slots (fill in this order, output must match these keys exactly):',
    ...format.slot_schema.map(renderSlot),
    '',
    'What kills it:',
    ...format.kill_rules.map((rule) => `- ${rule}`),
  ];
  return lines.filter((l): l is string => l !== null).join('\n');
}

/**
 * Assembles the full generation context: the doctrine constant plus exactly
 * one format spec, the claim, the tenant's examples for that format, the
 * voice doc, and a vocabulary sample. By construction there is no way to
 * inject a second format or a second brand doc.
 */
export function assembleGenerationContext(input: {
  format: FormatSpec;
  claim: ClaimContext;
  formatExamples: FormatExampleContext[];
  voiceDoc: string;
  vocabularySample: string[];
}): string {
  const { format, claim, formatExamples, voiceDoc, vocabularySample } = input;

  const claimLines = [
    `Claim to build the post around: ${claim.claim}`,
    claim.proof ? `Proof: ${claim.proof}` : null,
    claim.audience_segment ? `Audience segment: ${claim.audience_segment}` : null,
    claim.contradicts ? `Contradicts: ${claim.contradicts}` : null,
    claim.saturation_score === null
      ? 'Saturation: unknown (corpus too small to measure)'
      : `Saturation: ${claim.saturation_score}/10`,
  ].filter((l): l is string => l !== null);

  const exampleLines = formatExamples.length
    ? [
        'Tenant examples for this format (match this register, do not copy):',
        ...formatExamples.map((e) => `- ${e.slot_key}: ${e.example}`),
      ]
    : [];

  const vocabLines = vocabularySample.length
    ? [
        'Audience vocabulary (verbatim phrases; draw wording from these):',
        ...vocabularySample.map((p) => `- ${p}`),
      ]
    : [];

  return [
    DOCTRINE,
    '=== FORMAT SPEC (the only format for this call) ===',
    renderFormatSpec(format),
    '=== CLAIM ===',
    claimLines.join('\n'),
    ...(exampleLines.length ? ['=== EXAMPLES ===', exampleLines.join('\n')] : []),
    '=== VOICE ===',
    voiceDoc.trim() || 'No voice doc yet. Plain speech, no marketing register.',
    ...(vocabLines.length ? ['=== VOCABULARY ===', vocabLines.join('\n')] : []),
  ].join('\n\n');
}
