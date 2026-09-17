// Transcript driven timing for a video post. Deepgram gives every word a
// timestamp; from those we decide when each clip's on-screen text and
// screenshot / recording enter (on the words that name them, not at the clip
// boundary), where speech really starts and ends, and where our own subtitle
// lines fall. Pure functions except transcribeClip and placeCue.
//
// CONTRACT: signatures below are shared with assemble.ts, renderTimeline.ts
// and the cue-clip edge function. Implementations may change, signatures
// may not without updating every caller.

/** One transcribed word; s/e are ms in the clip file that was transcribed. */
export type TranscriptWord = { w: string; s: number; e: number };

/** Mirror of lib/video-edit.ts SlotCue. All ms in the slot's clip file. */
export type SlotCue = {
  text_start_ms: number | null;
  text_hold_ms: number | null;
  media_start_ms: number | null;
  media_end_ms: number | null;
  source: 'ai' | 'creator';
};

export type SubmissionCue = SlotCue & { slot_index: number };

/** Everything the placer knows about one clip. */
export type CueContext = {
  kind: string; // 'hook' | 'point' | 'outro'
  /** On-screen label for this clip, e.g. "5. Automate outreach". */
  label: string | null;
  /** The talking point the creator spoke from. */
  point_text: string | null;
  /** Title of the attached screenshot or recording, if any. */
  media_title: string | null;
  /** The manager's explanation of what the attached media shows, if any. */
  media_description?: string | null;
  media_kind: 'screenshot' | 'recording' | null;
  /** The company's product name, e.g. "Inkbound". */
  product_name: string | null;
  /** Length of the clip file in ms. */
  duration_ms: number;
};

export type KeepRange = [number, number];

export type SubtitleLine = { text: string; start_ms: number; duration_ms: number };

/** Default text hold when the cue does not set one. */
export const DEFAULT_TEXT_HOLD_MS = 4000;
/** Default cap for a screenshot after its cue; recordings run to the clip end. */
export const DEFAULT_SCREENSHOT_HOLD_MS = 8000;
/** Lead before the cue word so the overlay lands with the word, not after it. */
export const CUE_LEAD_MS = 150;

export type AskClaude = (system: string, user: string, maxTokens: number) => Promise<string>;

const SPEECH_LEAD_PAD_MS = 150;
const SPEECH_TAIL_PAD_MS = 250;
const PAUSE_CUT_MS = 700;
const PAUSE_KEEP_MS = 120;
const MIN_RANGE_MS = 400;

const SUBTITLE_PAUSE_BREAK_MS = 600;
const SUBTITLE_MIN_DURATION_MS = 600;

const MIN_CONTENT_WORD_CHARS = 4;
const MIN_PREFIX_MATCH_CHARS = 5;
const POINT_TEXT_CONTENT_WORDS = 6;

const STOPWORDS = new Set([
  'this', 'that', 'these', 'those', 'with', 'from', 'your', 'have', 'here',
  'there', 'what', 'when', 'where', 'which', 'while', 'will', 'would', 'could',
  'should', 'about', 'into', 'over', 'under', 'then', 'than', 'them', 'they',
  'their', 'been', 'being', 'were', 'does', 'doing', 'just', 'like', 'also',
  'because', 'really', 'very', 'more', 'most', 'some', 'such', 'only', 'even',
  'every', 'each', 'other', 'another', 'thing', 'things', 'something', 'anything',
  'everything', 'make', 'makes', 'made', 'want', 'wants', 'need', 'needs', 'going',
  'gonna', 'want', 'know', 'think', 'right', 'okay', 'yeah', 'well', 'much', 'many',
  'still', 'again', 'back', 'down', 'good', 'great', 'best', 'ever', 'never',
  'always', 'actually', 'basically', 'literally', 'pretty', 'kind', 'sort', 'lot',
  'lots', 'take', 'takes', 'give', 'gives', 'look', 'looks', 'first', 'second',
  'third', 'next', 'last', 'thats', 'youre', 'were', 'dont', 'cant', 'wont',
  'doesnt', 'isnt', 'arent', 'have', 'having', 'without', 'within', 'through',
  'before', 'after', 'above', 'below', 'between', 'same', 'both', 'once',
]);

type DeepgramWord = { word?: string; punctuated_word?: string; start?: number; end?: number };
type DeepgramResponse = {
  results?: { channels?: Array<{ alternatives?: Array<{ words?: DeepgramWord[] }> }> };
};

/**
 * Deepgram nova-3 word timestamps for one clip. `keyterms` boosts product
 * names and labels the model would otherwise misspell. Throws on transport
 * errors; returns [] for a silent clip.
 */
export async function transcribeClip(params: {
  url: string;
  apiKey: string;
  keyterms?: string[];
}): Promise<TranscriptWord[]> {
  const endpoint = new URL('https://api.deepgram.com/v1/listen');
  endpoint.searchParams.set('model', 'nova-3');
  endpoint.searchParams.set('smart_format', 'true');
  endpoint.searchParams.set('punctuate', 'true');
  endpoint.searchParams.set('utterances', 'false');
  for (const term of params.keyterms ?? []) {
    const trimmed = term.trim();
    if (trimmed) endpoint.searchParams.append('keyterm', trimmed);
  }
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Token ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url: params.url }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Deepgram ${res.status}: ${text}`);
  }
  const data = (await res.json()) as DeepgramResponse;
  const raw = data.results?.channels?.[0]?.alternatives?.[0]?.words ?? [];
  const words: TranscriptWord[] = [];
  for (const item of raw) {
    const text = item.punctuated_word ?? item.word;
    if (!text || typeof item.start !== 'number' || typeof item.end !== 'number') continue;
    words.push({ w: text, s: Math.round(item.start * 1000), e: Math.round(item.end * 1000) });
  }
  return words;
}

function normalizeWord(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function compactPhrase(raw: string): string {
  return normalizeWord(raw.replace(/[\s-]+/g, ''));
}

function stripLeadingNumber(label: string): string {
  return label.replace(/^\s*\d+\s*[.):-]?\s*/, '');
}

function contentWords(text: string, limit = Number.POSITIVE_INFINITY): string[] {
  const out: string[] = [];
  for (const token of text.split(/\s+/)) {
    const norm = normalizeWord(token);
    if (norm.length < MIN_CONTENT_WORD_CHARS || STOPWORDS.has(norm)) continue;
    out.push(norm);
    if (out.length >= limit) break;
  }
  return out;
}

function firstIndexMatching(words: TranscriptWord[], targets: string[]): number | null {
  if (targets.length === 0) return null;
  const set = new Set(targets);
  for (let i = 0; i < words.length; i++) {
    if (set.has(normalizeWord(words[i].w))) return i;
  }
  return null;
}

function productIndex(words: TranscriptWord[], productName: string | null): number | null {
  if (!productName) return null;
  const norm = normalizeWord(productName);
  const compact = compactPhrase(productName);
  if (!norm && !compact) return null;
  const allowPrefix = norm.length >= MIN_PREFIX_MATCH_CHARS;
  for (let i = 0; i < words.length; i++) {
    const word = normalizeWord(words[i].w);
    if (!word) continue;
    if (word === norm || word === compact) return i;
    if (allowPrefix && (word.startsWith(norm) || word.startsWith(compact))) return i;
  }
  return null;
}

function cueMsFromWord(word: TranscriptWord, durationMs: number): number {
  const upper = Math.max(0, durationMs - 1);
  return Math.min(Math.max(0, word.s - CUE_LEAD_MS), upper);
}

function keywordTextIndex(words: TranscriptWord[], ctx: CueContext): number | null {
  const fromLabel = ctx.label ? contentWords(stripLeadingNumber(ctx.label)) : [];
  const labelHit = firstIndexMatching(words, fromLabel);
  if (labelHit !== null) return labelHit;
  const fromPoint = ctx.point_text ? contentWords(ctx.point_text, POINT_TEXT_CONTENT_WORDS) : [];
  return firstIndexMatching(words, fromPoint);
}

function keywordMediaIndex(words: TranscriptWord[], ctx: CueContext): number | null {
  const productHit = productIndex(words, ctx.product_name);
  if (productHit !== null) return productHit;
  const fromTitle = ctx.media_title ? contentWords(ctx.media_title) : [];
  return firstIndexMatching(words, fromTitle);
}

function mediaEndMs(startMs: number, ctx: CueContext): number | null {
  if (ctx.media_kind !== 'screenshot') return null;
  const end = startMs + DEFAULT_SCREENSHOT_HOLD_MS;
  return end >= ctx.duration_ms ? null : end;
}

function buildCue(
  words: TranscriptWord[],
  ctx: CueContext,
  textIndex: number | null,
  mediaIndex: number | null,
): SlotCue {
  const textStart = ctx.kind === 'hook'
    ? 0
    : textIndex !== null
    ? cueMsFromWord(words[textIndex], ctx.duration_ms)
    : 0;
  let mediaStart: number | null;
  if (ctx.kind === 'outro' || ctx.media_kind === null) mediaStart = null;
  else if (mediaIndex !== null) mediaStart = cueMsFromWord(words[mediaIndex], ctx.duration_ms);
  else mediaStart = 0;
  return {
    text_start_ms: textStart,
    text_hold_ms: null,
    media_start_ms: mediaStart,
    media_end_ms: mediaStart === null ? null : mediaEndMs(mediaStart, ctx),
    source: 'ai',
  };
}

/**
 * Deterministic cue from keyword matches: media enters on the first mention
 * of the product name or a media title word, text enters on the first word
 * that matches the label or the point's key nouns. Anything unmatched falls
 * back to the clip start (today's behaviour). Never throws.
 */
export function keywordCue(words: TranscriptWord[], ctx: CueContext): SlotCue {
  const textIndex = ctx.kind === 'hook' ? null : keywordTextIndex(words, ctx);
  const mediaIndex = ctx.kind === 'outro' ? null : keywordMediaIndex(words, ctx);
  return buildCue(words, ctx, textIndex, mediaIndex);
}

type ClaudeCuePick = { text_word_index?: unknown; media_word_index?: unknown };

const PLACE_CUE_SYSTEM =
  'You time on-screen elements for a short vertical video clip in which a creator states one talking point. ' +
  'You get the clip transcript as one word per line, formatted "index [start_ms] word". ' +
  'Answer with one JSON object only: {"text_word_index": number|null, "media_word_index": number|null}. ' +
  'text_word_index: the index of the first word of the phrase where the creator starts stating the point (the label). ' +
  'Often this is the beginning of the clip, but not when the creator warms up or rambles first. ' +
  'media_word_index: the index of the word where the product, or the thing the attached media shows, is first mentioned. ' +
  'Use null when it is not mentioned. No prose, no code fences.';

function transcriptForPrompt(words: TranscriptWord[]): string {
  return words.map((word, i) => `${i} [${word.s}] ${word.w}`).join('\n');
}

function describeContext(ctx: CueContext): string {
  const lines = [`Clip kind: ${ctx.kind}`];
  if (ctx.label) lines.push(`On-screen label: ${ctx.label}`);
  if (ctx.point_text) lines.push(`Talking point: ${ctx.point_text}`);
  if (ctx.product_name) lines.push(`Product name: ${ctx.product_name}`);
  if (ctx.media_kind) {
    lines.push(`Attached media: ${ctx.media_kind}${ctx.media_title ? ` showing "${ctx.media_title}"` : ''}`);
    if (ctx.media_description) lines.push(`What the media shows: ${ctx.media_description}`);
  } else {
    lines.push('Attached media: none (media_word_index should be null)');
  }
  return lines.join('\n');
}

function parseJsonObject(text: string): ClaudeCuePick {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  const json = start >= 0 && end > start ? stripped.slice(start, end + 1) : stripped;
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== 'object' || parsed === null) throw new Error('cue pick is not an object');
  return parsed as ClaudeCuePick;
}

function validIndex(value: unknown, count: number): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  return value >= 0 && value < count ? value : null;
}

/**
 * Claude picks the cue words given the transcript and context, then
 * keywordCue fills anything it left null. Any Claude failure returns
 * keywordCue alone. Hooks always get text_start_ms 0.
 */
export async function placeCue(
  words: TranscriptWord[],
  ctx: CueContext,
  ask?: AskClaude,
): Promise<SlotCue> {
  const fallback = keywordCue(words, ctx);
  if (words.length === 0 || !ask) return fallback;
  try {
    const user = `${describeContext(ctx)}\n\nTranscript:\n${transcriptForPrompt(words)}`;
    const raw = await ask(PLACE_CUE_SYSTEM, user, 200);
    const pick = parseJsonObject(raw);
    const textIndex = validIndex(pick.text_word_index, words.length);
    const mediaIndex = validIndex(pick.media_word_index, words.length);
    const textStart = ctx.kind === 'hook'
      ? 0
      : textIndex !== null
      ? cueMsFromWord(words[textIndex], ctx.duration_ms)
      : fallback.text_start_ms;
    const mediaStart = ctx.kind === 'outro' || ctx.media_kind === null
      ? null
      : mediaIndex !== null
      ? cueMsFromWord(words[mediaIndex], ctx.duration_ms)
      : fallback.media_start_ms;
    return {
      text_start_ms: textStart,
      text_hold_ms: null,
      media_start_ms: mediaStart,
      media_end_ms: mediaStart === null ? null : mediaEndMs(mediaStart, ctx),
      source: 'ai',
    };
  } catch {
    return fallback;
  }
}

function sortedRanges(keep: KeepRange[]): KeepRange[] {
  return [...keep].sort((a, b) => a[0] - b[0]);
}

/**
 * Maps a clip-file ms to output ms after the silence cut. A time inside a
 * removed range snaps to the start of the next kept range; past the last
 * kept range clamps to the kept total.
 */
export function sourceToOutputMs(ms: number, keep: KeepRange[]): number {
  let offset = 0;
  for (const [start, end] of sortedRanges(keep)) {
    if (ms < start) return offset;
    if (ms <= end) return offset + (ms - start);
    offset += end - start;
  }
  return offset;
}

type Range = { startMs: number; endMs: number };

function pausesToCut(words: TranscriptWord[]): Range[] {
  const pauses: Range[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    const pauseStart = words[i].e;
    const pauseEnd = words[i + 1].s;
    if (pauseEnd - pauseStart > PAUSE_CUT_MS) pauses.push({ startMs: pauseStart, endMs: pauseEnd });
  }
  return pauses;
}

/**
 * Speech ranges from word timestamps: lead from first word minus a pad, tail
 * to last word plus a pad, interior pauses longer than the threshold cut and
 * snapped to word boundaries. Returns null when there are no words.
 */
export function speechRangesFromWords(
  words: TranscriptWord[],
  durationMs: number,
): { startMs: number; endMs: number; keep: { startMs: number; endMs: number }[] } | null {
  if (words.length === 0) return null;
  const first = words[0];
  const last = words[words.length - 1];
  const startMs = Math.max(0, first.s - SPEECH_LEAD_PAD_MS);
  const endMs = Math.max(startMs, Math.min(durationMs, last.e + SPEECH_TAIL_PAD_MS));

  const keep: Range[] = [];
  let cursor = startMs;
  for (const pause of pausesToCut(words)) {
    const pieceEnd = pause.startMs + PAUSE_KEEP_MS;
    const nextStart = pause.endMs - PAUSE_KEEP_MS;
    if (pieceEnd - cursor < MIN_RANGE_MS || endMs - nextStart < MIN_RANGE_MS) continue;
    keep.push({ startMs: cursor, endMs: pieceEnd });
    cursor = nextStart;
  }
  keep.push({ startMs: cursor, endMs });
  return { startMs, endMs, keep };
}

function overlapsKeep(word: TranscriptWord, keep: KeepRange[]): boolean {
  return keep.some(([start, end]) => word.s < end && word.e > start);
}

function endsSentence(word: string): boolean {
  return /[.?!]["')\]]*$/.test(word);
}

function lineFromWords(
  group: TranscriptWord[],
  keep: KeepRange[],
  offsetMs: number,
): SubtitleLine {
  const first = group[0];
  const last = group[group.length - 1];
  const startOut = sourceToOutputMs(first.s, keep);
  const endOut = sourceToOutputMs(last.e, keep);
  return {
    text: group.map((word) => word.w).join(' '),
    start_ms: startOut + offsetMs,
    duration_ms: Math.max(SUBTITLE_MIN_DURATION_MS, endOut - startOut),
  };
}

function trimOverlaps(lines: SubtitleLine[]): SubtitleLine[] {
  for (let i = 0; i < lines.length - 1; i++) {
    const current = lines[i];
    const next = lines[i + 1];
    if (current.start_ms + current.duration_ms > next.start_ms) {
      current.duration_ms = Math.max(0, next.start_ms - current.start_ms);
    }
  }
  return lines;
}

/**
 * Groups words into subtitle lines of at most maxChars, split on sentence
 * punctuation and pauses, with times already mapped through `keep` and
 * offset by `offsetMs` (the clip's start on the stitched output).
 */
export function subtitleLines(
  words: TranscriptWord[],
  keep: KeepRange[],
  offsetMs: number,
  maxChars: number,
): SubtitleLine[] {
  const kept = words.filter((word) => overlapsKeep(word, keep));
  const lines: SubtitleLine[] = [];
  let group: TranscriptWord[] = [];
  let chars = 0;
  const flush = () => {
    if (group.length > 0) lines.push(lineFromWords(group, keep, offsetMs));
    group = [];
    chars = 0;
  };
  for (const word of kept) {
    const previous = group[group.length - 1];
    if (previous) {
      const tooLong = chars + 1 + word.w.length > maxChars;
      const longPause = word.s - previous.e > SUBTITLE_PAUSE_BREAK_MS;
      if (tooLong || longPause) flush();
    }
    group.push(word);
    chars += (group.length > 1 ? 1 : 0) + word.w.length;
    if (endsSentence(word.w)) flush();
  }
  flush();
  return trimOverlaps(lines);
}
