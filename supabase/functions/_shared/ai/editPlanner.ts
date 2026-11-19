// The edit planner: a creator's raw takes in, an EditPlan out. The model sees
// what an editor would (every word with its time, the pauses, repeated tries,
// the brief's script and on-screen text, the reference's beat sheet, product
// media by id, the brief's sound) and answers in word indexes only. Every
// millisecond in the plan is computed here from the real word timings, then
// checked and repaired, so an impossible plan never reaches the phone. When
// the model call fails the same code builds a plain trim from the timings and
// says so (ai: false plus a reason).

import type { EditInsert, EditKeep, EditPlan, EditText, TimedWord } from './contracts.ts';
import { generate, type Effort, type JsonSchema, type LlmDeps, type LlmImage, type LlmUsage } from './llm.ts';

// ---------------------------------------------------------------- input

export type PlannerTake = {
  assetId: string;
  /** 0 when unknown; the last word plus a tail stands in. */
  durationMs: number;
  words: TimedWord[];
  /** Index of the brief clip this take was recorded for, when the camera knew. */
  scriptClip?: number | null;
};

export type PlannerMedia = {
  id: string;
  title: string;
  description: string;
  kind: 'clip' | 'still';
  durationMs: number | null;
};

export type PlannerScriptClip = { say: string; onScreen: string; cta: boolean };

export type PlannerBrief = {
  title: string;
  /** 'Talking Head' | 'Long Text' | 'Greenscreen' | ... as saved on the brief. */
  type: string | null;
  /** 'Guided' (scripted clip by clip) or 'Outline' (own words). */
  kind: string | null;
  notes: string;
  productName: string | null;
  clips: PlannerScriptClip[];
  sound: { title: string; artist: string } | null;
};

/** Text already on the video (the brief's template text, or the creator's own). */
export type PlannerOverlay = { id: string; text: string; startMs: number; endMs: number; y: number };

export type PlannerInput = {
  companyId: string | null;
  takes: PlannerTake[];
  brief: PlannerBrief;
  media: PlannerMedia[];
  /** renderReferenceForPrompt(analysis) when the brief was modelled on a post. */
  reference: string | null;
  overlays: PlannerOverlay[];
  /** Optional still per take, so text and inserts can avoid the face. */
  frames?: { assetId: string; image: LlmImage }[];
};

export type PlanResult = {
  plan: EditPlan;
  /** Existing overlay ids the plan's texts take the place of. */
  replaceOverlayIds: string[];
  /** What the validator changed, in plain words, for logs and the learning job. */
  repairs: string[];
  /** Why the deterministic fallback ran; null when the model planned the edit. */
  fallbackReason: string | null;
  runId: string | null;
  model: string | null;
  usage: LlmUsage | null;
};

// ---------------------------------------------------------------- limits
// The numbers come from research/04-ugc-craft.md section 5 and the document
// limits in lib/edit-document.ts.

export const MIN_PIECE_MS = 300;
export const MAX_PIECES = 60;
const MAX_TEXTS = 12;
const MAX_INSERTS = 4;
/** A pause longer than this inside a kept range is tightened. */
const PAUSE_CUT_MS = 400;
/** Air left before a word after a cut, and after the last word before one. */
const PAD_IN_MS = 80;
const PAD_OUT_MS = 120;
const LEAD_MS = 120;
const TAIL_MS = 200;
const PUNCH_ZOOM = 1.2;
const FAST_SPEED = 1.5;
/** Speech already at this pace is not sped up. */
const FAST_ENOUGH_WPS = 2.6;
const TEXT_LEAD_MS = 150;
/** Reading time: 350 ms a word plus half a second, never under 1.5 s. */
const READ_MS_PER_WORD = 350;
const READ_BASE_MS = 500;
const READ_MIN_MS = 1500;
const HOOK_MIN_MS = 2500;
const MAX_TEXT_WORDS = 15;
const MAX_TEXT_CHARS = 90;
const INSERT_MIN_MS = 1500;
const INSERT_MAX_CLIP_MS = 6000;
const INSERT_MAX_STILL_MS = 4000;
const INSERT_DROP_MS = 1000;
/** Music under a voice: quiet enough that the words win. */
const BED_MIN = 5;
const BED_MAX = 30;
const BED_DEFAULT = 12;

const FILLER = /^(u+h+m*|u+m+|e+r+m*|h+m+|m+h*m+|a+h+)[.,!?…]*$/i;

export function isFiller(word: string): boolean {
  return FILLER.test(word.trim());
}

// ---------------------------------------------------------------- model output

type RawSegment = { take: number; first_word: number; last_word: number; framing: 'full' | 'punch_in'; pace: 'normal' | 'faster'; reason: string };
type RawText = {
  role: EditText['role'];
  text: string;
  take: number;
  word: number;
  hold: 'read' | 'until_next_text' | 'to_end';
  position: EditText['position'];
  replaces: string;
};
type RawInsert = { media_id: string; take: number; first_word: number; last_word: number; layout: EditInsert['layout'] };
export type RawPlan = {
  segments: RawSegment[];
  texts: RawText[];
  inserts: RawInsert[];
  captions: { enabled: boolean; position: 'center' | 'lower' };
  sound: { use_brief_track: boolean; track_volume: number };
  summary: string[];
};

const obj = (properties: Record<string, unknown>): JsonSchema => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const EDIT_PLAN_SCHEMA: JsonSchema = obj({
  segments: {
    type: 'array',
    description: 'The ranges to keep, in the order they play in the finished video.',
    items: obj({
      take: { type: 'integer', description: 'Take number as labelled in the input.' },
      first_word: { type: 'integer', description: 'Index of the first word kept, inclusive. Any value for a take with no speech.' },
      last_word: { type: 'integer', description: 'Index of the last word kept, inclusive.' },
      framing: { type: 'string', enum: ['full', 'punch_in'] },
      pace: { type: 'string', enum: ['normal', 'faster'] },
      reason: { type: 'string', description: 'A few words: why this range, or why this try over the others.' },
    }),
  },
  texts: {
    type: 'array',
    items: obj({
      role: { type: 'string', enum: ['hook', 'header', 'label', 'cta'] },
      text: { type: 'string' },
      take: { type: 'integer' },
      word: { type: 'integer', description: 'The kept word the text appears on.' },
      hold: { type: 'string', enum: ['read', 'until_next_text', 'to_end'] },
      position: { type: 'string', enum: ['top', 'upper', 'center', 'lower'] },
      replaces: { type: 'string', description: 'Id of the existing on-screen text this one takes the place of, or an empty string.' },
    }),
  },
  inserts: {
    type: 'array',
    items: obj({
      media_id: { type: 'string' },
      take: { type: 'integer' },
      first_word: { type: 'integer' },
      last_word: { type: 'integer' },
      layout: { type: 'string', enum: ['overlay', 'split', 'full'] },
    }),
  },
  captions: obj({ enabled: { type: 'boolean' }, position: { type: 'string', enum: ['center', 'lower'] } }),
  sound: obj({ use_brief_track: { type: 'boolean' }, track_volume: { type: 'integer', description: '0 to 100.' } }),
  summary: { type: 'array', items: { type: 'string' } },
});

// ---------------------------------------------------------------- prompt

export const EDIT_PLANNER_SYSTEM = `You are the editor for short vertical videos that ordinary people film on their phones for TikTok and Instagram Reels, usually talking to the camera about an app or a product. A creator has just recorded their takes and tapped one button. Your plan becomes their timeline: they will watch it, maybe adjust it, and post it. The aim is the edit a good creator would have made by hand, one that feels native to the feed and not like an ad.

What you are given. Every take is listed with each spoken word and its index, grouped into phrases with the time they were said, the speaking pace, and the pauses between them. Likely repeated tries at the same line are pointed out, as are filler sounds. You also get the brief: the script for each clip when there is one, the text the brief wants on screen, the call to action, the sound, the product media you may show, and sometimes an analysis of the reference post the brief was modelled on. Text already on the video is listed with its id.

How you answer. You refer to words by take number and word index and never write times. The app turns your indexes into exact cut points from the real timings, adds a little air around each cut so no word is clipped, and tightens pauses inside the ranges you keep. So choose ranges by meaning, and choose the boundary words carefully: a range that starts one word late or ends one word early is the most common way an edit goes wrong. Check each boundary against the words in the input before you settle on it.

Choosing what to keep. List the ranges that stay, in the order they should play. Everything you leave out is cut.
- When a line was tried more than once, keep one try: the cleanest complete delivery, which is often but not always the last. A try that trails off, restarts midway, or stumbles on the product name loses to one that lands. If the brief has a script, use it to recognise what each take was meant to be and to put the lines in script order even when they were recorded out of order.
- Leave out false starts, "wait, let me start again", asides to someone off camera, and filler sounds, when the words on each side of the cut join into something a person could have said in one breath. If removing a word would make the sentence sound chopped, keep it: a natural "so" or "like" inside fluent speech is part of how people talk.
- Do not cut content to make the video shorter. The only version of a point stays, and so does every mention of the product and the call to action.
- The video should open on the first word of the hook. Nothing before it survives: no breath, no "okay", no settling in.
- A take with no speech is b-roll or a silent shot. Keep it where it belongs or leave it out; when you keep it the whole take plays.

Rhythm. Viewers decide in the first couple of seconds and leave when nothing changes, so a good edit gives the eye something new every few seconds: a cut, a punch-in, an insert, or new text. It should also stay invisible. Too many effects read as an ad.
- A punch-in is a tighter crop on the same shot. Use it on the line that matters most in a stretch (the claim, the number, the turn) and return to the full frame for the next thought. It also hides a jump cut inside one take, because the frame changes at the cut. Two or three in a short video is usually right, and consecutive ranges should not all be punched in.
- "faster" speeds a range up slightly. It is for slow stretches only: a drawn-out explanation, or a silent shot that lingers. Leave normal speech alone.
- If a reference analysis is present, match its pacing where the material allows: how long its hook runs, how often it cuts, when its text appears and how it captions. Copy the structure, not its words.

On-screen text. Text is anchored to the kept word it should appear on; the app shows it a moment before that word and holds it long enough to read.
- The hook text is on screen from the first frame. Take it from the brief when the brief gives one. Otherwise write the short version of what the creator opens with, five to ten words, in their voice.
- Headers mark the start of a tip, a step or a section, and labels name the thing being shown. Use them when the video really has parts; a single story needs only its hook. Keep each to a handful of words that add something the voice does not, never "Tip one".
- A cta text goes on the line where the creator asks for the action, and only if the brief has a call to action.
- "hold" says how long the text stays: "read" for long enough to read comfortably, "until_next_text" for a header that should stay until the next one, "to_end" to hold through the end.
- Positions are zones that stay clear of the app's own buttons and caption block: "top" and "upper" sit above the face and suit hooks and headers, "center" is over the middle of the frame, "lower" sits just above where captions go. Two texts on screen at once need different zones, and three at once is too many.
- Text that is already on the video stays unless you replace it. When the existing text is right but mistimed, or you have a better line for the same job, emit your text with "replaces" set to that id. Do not add a second text that says the same thing as one that is staying.
- Sentence case. No emoji, no dashes, no quotation marks, no hashtags. State nothing about the product that the creator or the brief did not say.

Product media. Show the thing at the moment it is mentioned. For each insert give the range of words during which it is on screen, starting on the word that names or describes it. "overlay" floats it over the speaker and suits a quick look; "split" puts the speaker on top and the media underneath and suits a longer walkthrough; "full" fills the frame while the voice carries on. Use only the media ids listed, each where the words really are about it, and prefer none to a loose match.

Captions. Spoken videos are mostly watched with captions, so turn them on whenever there is speech. They sit low by default; choose "center" only when your own text needs the lower zone.

Sound. If the brief names a sound, use it. Under a voice it is a quiet bed, roughly a tenth of full volume, so every word stays clear. On a video with no speech the sound is the point and plays at full volume.

Summary. Finish with two to four short lines for the creator saying what you did, in plain words and in the order they would notice it: what was cut, which tries you chose, what text and media you added. For example "Cut 9 seconds of pauses and two restarts". No praise, no advice.`;

function secs(ms: number): string {
  return (ms / 1000).toFixed(2);
}

type Phrase = { take: number; first: number; last: number; text: string };

function norm(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9']/g, '');
}

function takePhrases(take: PlannerTake, t: number): Phrase[] {
  const out: Phrase[] = [];
  let first = 0;
  const words = take.words;
  for (let i = 0; i < words.length; i++) {
    const next = words[i + 1];
    const ends = !next || next.s - words[i].e >= 350 || /[.?!]["')\]]*$/.test(words[i].w) || i - first >= 13;
    if (!ends) continue;
    out.push({ take: t, first, last: i, text: words.slice(first, i + 1).map((w) => w.w).join(' ') });
    first = i + 1;
  }
  return out;
}

function similar(a: Phrase, b: Phrase): boolean {
  const ta = a.text.split(/\s+/).map(norm).filter(Boolean);
  const tb = b.text.split(/\s+/).map(norm).filter(Boolean);
  if (ta.length < 3 || tb.length < 3) return false;
  if (ta.slice(0, 3).join(' ') === tb.slice(0, 3).join(' ')) return true;
  const sa = new Set(ta);
  const sb = new Set(tb);
  let both = 0;
  for (const w of sa) if (sb.has(w)) both += 1;
  return both / (sa.size + sb.size - both) >= 0.6;
}

function takeDuration(take: PlannerTake): number {
  const last = take.words[take.words.length - 1];
  return take.durationMs > 0 ? take.durationMs : last ? last.e + 500 : 0;
}

/** The takes as an editor would mark them up: phrases, times, pace, pauses, fillers, repeats. */
export function renderTakes(takes: PlannerTake[], brief: PlannerBrief): string {
  const lines: string[] = [];
  const phrases: Phrase[] = [];
  takes.forEach((take, t) => {
    const forClip = take.scriptClip != null && take.scriptClip >= 0 && take.scriptClip < brief.clips.length ? `, recorded for script clip ${take.scriptClip + 1}` : '';
    lines.push(`Take ${t} (${secs(takeDuration(take))} s${forClip})`);
    if (take.words.length === 0) {
      lines.push('  no speech detected');
      lines.push('');
      return;
    }
    const own = takePhrases(take, t);
    phrases.push(...own);
    let prevEnd = 0;
    for (const p of own) {
      const a = take.words[p.first];
      const b = take.words[p.last];
      const gap = a.s - prevEnd;
      if (gap >= 300) lines.push(`  (${p.first === 0 ? 'silence' : 'pause'} ${secs(gap)} s)`);
      const dur = Math.max(1, b.e - a.s);
      const count = p.last - p.first + 1;
      const pace = count >= 3 ? `, ${((count * 1000) / dur).toFixed(1)} words/s` : '';
      const fillers = take.words.slice(p.first, p.last + 1).flatMap((w, i) => (isFiller(w.w) ? [p.first + i] : []));
      const fill = fillers.length ? `, filler at ${fillers.join(', ')}` : '';
      lines.push(`  ${secs(a.s)}-${secs(b.e)} s${pace}${fill}`);
      lines.push(`    ${take.words.slice(p.first, p.last + 1).map((w, i) => `${p.first + i}:${w.w}`).join(' ')}`);
      prevEnd = b.e;
    }
    const tail = takeDuration(take) - prevEnd;
    if (tail >= 300) lines.push(`  (silence ${secs(tail)} s to the end)`);
    lines.push('');
  });

  const repeats: string[] = [];
  for (let i = 0; i < phrases.length && repeats.length < 20; i++) {
    for (let j = i + 1; j < phrases.length && repeats.length < 20; j++) {
      if (!similar(phrases[i], phrases[j])) continue;
      const a = phrases[i];
      const b = phrases[j];
      repeats.push(`- take ${a.take} words ${a.first}-${a.last} and take ${b.take} words ${b.first}-${b.last}`);
    }
  }
  if (repeats.length) {
    lines.push('These look like tries at the same line (found by matching words, so check them):');
    lines.push(...repeats);
  }
  return lines.join('\n').trim();
}

export function renderBrief(input: PlannerInput): string {
  const { brief, media, overlays } = input;
  const lines: string[] = ['# The brief'];
  lines.push(`Title: ${brief.title || '(none, the creator started this post on their own)'}`);
  if (brief.type) lines.push(`Format: ${brief.type}${brief.kind ? `, ${brief.kind.toLowerCase()}` : ''}`);
  if (brief.productName) lines.push(`Product: ${brief.productName}`);
  if (brief.notes) lines.push(`Notes from the brand: ${brief.notes.slice(0, 600)}`);
  if (brief.clips.length) {
    lines.push('', brief.kind === 'Outline' ? 'Outline (the creator says it in their own words):' : 'Script, clip by clip:');
    brief.clips.forEach((c, i) => {
      lines.push(`${i + 1}. ${c.cta ? '[call to action] ' : ''}Say: ${c.say || '(nothing scripted)'}`);
      if (c.onScreen) lines.push(`   On screen: ${c.onScreen}`);
    });
  } else {
    lines.push('', 'No script: the creator spoke freely.');
  }
  lines.push('', brief.sound ? `Sound on the brief: ${brief.sound.title}${brief.sound.artist ? ` by ${brief.sound.artist}` : ''}` : 'Sound on the brief: none');
  lines.push('', '# Product media you may show');
  if (media.length === 0) lines.push('None.');
  for (const m of media) {
    const what = m.kind === 'clip' ? `screen recording${m.durationMs ? `, ${secs(m.durationMs)} s` : ''}` : 'screenshot';
    lines.push(`- ${m.id}: ${m.title} (${what})${m.description ? `. ${m.description.slice(0, 200)}` : ''}`);
  }
  lines.push('', '# Text already on the video');
  if (overlays.length === 0) lines.push('None.');
  for (const o of overlays) {
    const zone = o.y < 0.22 ? 'top' : o.y < 0.36 ? 'upper' : o.y < 0.55 ? 'center' : 'lower';
    lines.push(`- ${o.id}: "${o.text.replace(/\s+/g, ' ').slice(0, 160)}" (${zone}, ${secs(o.startMs)}-${secs(o.endMs)} s of the uncut video)`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------- compile

export class PlanError extends Error {}

/** No dashes as punctuation, no emoji, one line, capped. */
export function cleanText(raw: string, maxChars = MAX_TEXT_CHARS): string {
  const text = raw
    .replace(/\s+[—–-]+\s+/g, ', ')
    .replace(/[—–]/g, ' ')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“‘]+|["'”’]+$/g, '')
    .trim();
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), 1)).trim();
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** How long a text has to stay up to be read. */
export function readMs(text: string): number {
  return Math.max(READ_MIN_MS, wordCount(text) * READ_MS_PER_WORD + READ_BASE_MS);
}

type Piece = {
  take: number;
  inMs: number;
  outMs: number;
  /** First and last spoken moment inside the piece; cuts never cross them. */
  speechStart: number;
  speechEnd: number;
  zoom: number;
  speed: 1 | 1.5 | 2;
  reason: string;
};

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

/** A kept word range as source pieces, pauses tightened, cut points padded but never into a neighbour word. */
function rangePieces(take: PlannerTake, t: number, first: number, last: number, base: Pick<Piece, 'zoom' | 'speed' | 'reason'>): Piece[] {
  const words = take.words;
  const duration = takeDuration(take);
  const out: Piece[] = [];
  let a = first;
  for (let i = first; i <= last; i++) {
    const runEnds = i === last || words[i + 1].s - words[i].e > PAUSE_CUT_MS;
    if (!runEnds) continue;
    const inMs = a === 0 ? Math.max(0, words[a].s - LEAD_MS) : Math.min(words[a].s, Math.max(words[a - 1].e, words[a].s - PAD_IN_MS));
    const outMs = i === words.length - 1 ? Math.min(duration, words[i].e + TAIL_MS) : Math.max(words[i].e, Math.min(words[i + 1].s, words[i].e + PAD_OUT_MS));
    out.push({ take: t, inMs, outMs: Math.max(inMs, outMs), speechStart: words[a].s, speechEnd: words[i].e, ...base });
    a = i + 1;
  }
  return out;
}

function sanitizeSegments(input: PlannerInput, raw: RawSegment[], repairs: string[]): RawSegment[] {
  const used: [number, number][][] = input.takes.map(() => []);
  const out: RawSegment[] = [];
  for (const s of raw) {
    if (!isInt(s.take) || s.take < 0 || s.take >= input.takes.length) {
      repairs.push(`dropped a range on take ${s.take}, which does not exist`);
      continue;
    }
    const n = input.takes[s.take].words.length;
    if (n === 0) {
      if (used[s.take].length) continue;
      used[s.take].push([0, 0]);
      out.push({ ...s, first_word: 0, last_word: 0 });
      continue;
    }
    if (!isInt(s.first_word) || !isInt(s.last_word)) {
      repairs.push(`dropped a range on take ${s.take} with no word indexes`);
      continue;
    }
    let first = Math.min(s.first_word, s.last_word);
    let last = Math.max(s.first_word, s.last_word);
    if (last < 0 || first >= n) {
      repairs.push(`dropped take ${s.take} words ${s.first_word}-${s.last_word}, outside the take`);
      continue;
    }
    if (first < 0 || last >= n) repairs.push(`clamped take ${s.take} words ${s.first_word}-${s.last_word} to the take`);
    first = Math.max(0, first);
    last = Math.min(n - 1, last);
    // A word plays once: keep the longest stretch no earlier range already took.
    let best: [number, number] | null = null;
    let run = -1;
    for (let i = first; i <= last + 1; i++) {
      const free = i <= last && !used[s.take].some(([a, b]) => i >= a && i <= b);
      if (free && run < 0) run = i;
      if (!free && run >= 0) {
        if (!best || i - run > best[1] - best[0] + 1) best = [run, i - 1];
        run = -1;
      }
    }
    if (!best) {
      repairs.push(`dropped take ${s.take} words ${first}-${last}, already kept`);
      continue;
    }
    if (best[0] !== first || best[1] !== last) repairs.push(`trimmed take ${s.take} words ${first}-${last} to ${best[0]}-${best[1]} so nothing plays twice`);
    used[s.take].push(best);
    out.push({ ...s, first_word: best[0], last_word: best[1] });
  }
  return out;
}

function buildPieces(input: PlannerInput, segments: RawSegment[], repairs: string[]): Piece[] {
  // Punch-ins lose their point when most of the video is punched in.
  const punched = segments.filter((s) => s.framing === 'punch_in').length;
  let thin = segments.length >= 4 && punched > segments.length / 2;
  if (thin) repairs.push('removed every other punch-in, more than half the ranges were punched in');
  let punchSeen = 0;

  let pieces: Piece[] = [];
  for (const s of segments) {
    const take = input.takes[s.take];
    let zoom = 1;
    if (s.framing === 'punch_in') {
      punchSeen += 1;
      if (!thin || punchSeen % 2 === 1) zoom = PUNCH_ZOOM;
    }
    let speed: Piece['speed'] = 1;
    if (s.pace === 'faster') {
      const words = take.words;
      const spanMs = words.length ? Math.max(1, words[s.last_word].e - words[s.first_word].s) : 0;
      const wps = words.length ? ((s.last_word - s.first_word + 1) * 1000) / spanMs : 0;
      if (wps >= FAST_ENOUGH_WPS) repairs.push(`kept take ${s.take} words ${s.first_word}-${s.last_word} at normal speed, the speech is already quick`);
      else speed = FAST_SPEED;
    }
    const base = { zoom, speed, reason: cleanText(s.reason ?? '', 120) };
    if (take.words.length === 0) {
      const duration = takeDuration(take);
      if (duration >= MIN_PIECE_MS) pieces.push({ take: s.take, inMs: 0, outMs: duration, speechStart: 0, speechEnd: duration, ...base });
      continue;
    }
    pieces.push(...rangePieces(take, s.take, s.first_word, s.last_word, base));
  }
  thin = false;

  // Too short to show: slow it back down, then borrow air on both sides.
  for (const p of pieces) {
    if ((p.outMs - p.inMs) / p.speed >= MIN_PIECE_MS) continue;
    p.speed = 1;
    const need = MIN_PIECE_MS - (p.outMs - p.inMs);
    if (need <= 0) continue;
    const duration = takeDuration(input.takes[p.take]);
    p.outMs = Math.min(duration, p.outMs + Math.ceil(need / 2));
    p.inMs = Math.max(0, p.inMs - (MIN_PIECE_MS - (p.outMs - p.inMs)));
    p.outMs = Math.min(duration, p.inMs + Math.max(MIN_PIECE_MS, p.outMs - p.inMs));
  }

  // No source moment plays twice: where two pieces of a take overlap, meet between their words.
  for (let t = 0; t < input.takes.length; t++) {
    const own = pieces.filter((p) => p.take === t).sort((a, b) => a.inMs - b.inMs);
    for (let i = 0; i < own.length - 1; i++) {
      const a = own[i];
      const b = own[i + 1];
      if (a.outMs <= b.inMs) continue;
      const lo = Math.min(a.speechEnd, b.speechStart);
      const hi = Math.max(a.speechEnd, b.speechStart);
      const meet = Math.max(lo, Math.min(hi, Math.round((a.outMs + b.inMs) / 2)));
      a.outMs = Math.max(a.inMs, meet);
      b.inMs = Math.min(b.outMs, meet);
    }
  }

  // Back to back pieces that continue the same shot are one clip.
  const merged: Piece[] = [];
  for (const p of pieces) {
    const prev = merged[merged.length - 1];
    if (prev && prev.take === p.take && prev.zoom === p.zoom && prev.speed === p.speed && p.inMs >= prev.outMs && p.inMs - prev.outMs <= 1) {
      prev.outMs = p.outMs;
      prev.speechEnd = p.speechEnd;
      continue;
    }
    merged.push({ ...p });
  }
  pieces = merged.filter((p) => {
    const ok = (p.outMs - p.inMs) / p.speed >= MIN_PIECE_MS;
    if (!ok) repairs.push(`dropped a ${Math.round(p.outMs - p.inMs)} ms sliver of take ${p.take}`);
    return ok;
  });

  // The document holds 60 clips: close the smallest gaps between neighbours from one take first.
  while (pieces.length > MAX_PIECES) {
    let best = -1;
    let gap = Infinity;
    for (let i = 0; i < pieces.length - 1; i++) {
      const a = pieces[i];
      const b = pieces[i + 1];
      if (a.take !== b.take || b.inMs < a.outMs) continue;
      if (b.inMs - a.outMs < gap) {
        gap = b.inMs - a.outMs;
        best = i;
      }
    }
    if (best < 0) {
      repairs.push(`kept the first ${MAX_PIECES} clips, the plan had ${pieces.length}`);
      pieces = pieces.slice(0, MAX_PIECES);
      break;
    }
    const a = pieces[best];
    const b = pieces[best + 1];
    pieces.splice(best, 2, { ...a, outMs: b.outMs, speechEnd: b.speechEnd, speed: a.speed === b.speed ? a.speed : 1 });
  }
  return pieces.map((p) => ({ ...p, inMs: Math.round(p.inMs), outMs: Math.round(p.outMs) }));
}

type Placed = Piece & { outStart: number; outDur: number };

function place(pieces: Piece[]): { placed: Placed[]; total: number } {
  let cursor = 0;
  const placed = pieces.map((p) => {
    const outDur = Math.round((p.outMs - p.inMs) / p.speed);
    const row = { ...p, outStart: cursor, outDur };
    cursor += outDur;
    return row;
  });
  return { placed, total: cursor };
}

type Zone = EditText['position'];
const ZONES: Zone[] = ['upper', 'top', 'center', 'lower'];

/**
 * The model's word-index plan as an EditPlan in milliseconds. Throws PlanError
 * when nothing usable is left, so the caller falls back instead of shipping it.
 */
export function compilePlan(input: PlannerInput, raw: RawPlan, ai: boolean): { plan: EditPlan; replaceOverlayIds: string[]; repairs: string[] } {
  const repairs: string[] = [];
  const segments = sanitizeSegments(input, Array.isArray(raw.segments) ? raw.segments : [], repairs);
  const pieces = buildPieces(input, segments, repairs);
  if (pieces.length === 0) throw new PlanError('the plan keeps nothing');

  const allWords = input.takes.reduce((n, t) => n + t.words.length, 0);
  const keptWords = segments.reduce((n, s) => n + (input.takes[s.take].words.length ? s.last_word - s.first_word + 1 : 0), 0);
  if (allWords >= 12 && keptWords / allWords < 0.15) throw new PlanError(`the plan keeps ${keptWords} of ${allWords} words`);

  const { placed, total } = place(pieces);
  if (total < MIN_PIECE_MS) throw new PlanError('the plan is shorter than one clip');
  const hasSpeech = keptWords > 0;

  /** Where a word lands on the output clock; null when it was cut. */
  const wordOut = (t: number, i: number): { s: number; e: number } | null => {
    const w = input.takes[t]?.words[i];
    if (!w) return null;
    for (const p of placed) {
      if (p.take !== t || w.s >= p.outMs || w.e <= p.inMs) continue;
      return {
        s: p.outStart + Math.round((Math.max(w.s, p.inMs) - p.inMs) / p.speed),
        e: p.outStart + Math.round((Math.min(w.e, p.outMs) - p.inMs) / p.speed),
      };
    }
    return null;
  };
  /** The word, or the next kept word after it in the same take. */
  const anchor = (t: number, i: number, what: string): { s: number; e: number } | null => {
    if (!isInt(t) || !isInt(i) || t < 0 || t >= input.takes.length) return null;
    const n = input.takes[t].words.length;
    if (n === 0) {
      const p = placed.find((x) => x.take === t);
      return p ? { s: p.outStart, e: p.outStart + p.outDur } : null;
    }
    for (let k = Math.max(0, i); k < Math.min(n, Math.max(0, i) + 4); k++) {
      const hit = wordOut(t, k);
      if (!hit) continue;
      if (k !== i) repairs.push(`moved ${what} from take ${t} word ${i} to word ${k}, the first one that was kept`);
      return hit;
    }
    return null;
  };

  // ---- inserts
  const mediaById = new Map(input.media.map((m) => [m.id, m]));
  const inserts: EditInsert[] = [];
  const rawInserts = (Array.isArray(raw.inserts) ? raw.inserts : [])
    .map((m) => ({ m, from: anchor(m.take, m.first_word, 'an insert'), to: wordOut(m.take, m.last_word) }))
    .filter((x): x is { m: RawInsert; from: { s: number; e: number }; to: { s: number; e: number } | null } => {
      if (!mediaById.has(x.m.media_id)) repairs.push(`dropped an insert of unknown media ${x.m.media_id}`);
      else if (!x.from) repairs.push(`dropped the insert of ${x.m.media_id}, its words were cut`);
      return mediaById.has(x.m.media_id) && x.from !== null;
    })
    .sort((a, b) => a.from.s - b.from.s);
  for (const { m, from, to } of rawInserts) {
    if (inserts.length >= MAX_INSERTS) {
      repairs.push(`kept ${MAX_INSERTS} inserts, dropped the rest`);
      break;
    }
    const media = mediaById.get(m.media_id)!;
    const prevEnd = inserts[inserts.length - 1]?.end_ms ?? 0;
    const start = Math.max(prevEnd, from.s - TEXT_LEAD_MS, 0);
    const cap = Math.min(media.kind === 'clip' ? INSERT_MAX_CLIP_MS : INSERT_MAX_STILL_MS, media.kind === 'clip' && media.durationMs ? media.durationMs : Infinity);
    let end = Math.max(to ? to.e : from.e, start + INSERT_MIN_MS);
    end = Math.min(end, start + cap, total);
    if (end - start < Math.min(INSERT_DROP_MS, cap)) {
      repairs.push(`dropped the insert of ${m.media_id}, under a second was left for it`);
      continue;
    }
    let layout = m.layout;
    if (layout === 'split' && media.kind === 'clip' && (!media.durationMs || media.durationMs < end - start)) {
      layout = 'overlay';
      repairs.push(`showed ${m.media_id} as an overlay, its length is unknown or too short for a split`);
    }
    inserts.push({ media_id: m.media_id, start_ms: start, end_ms: end, layout });
  }

  // ---- texts
  const overlayIds = new Set(input.overlays.map((o) => o.id));
  const replaceOverlayIds = new Set<string>();
  const captionsOn = raw.captions?.enabled !== false && hasSpeech;
  type Draft = EditText & { min: number; hold: RawText['hold'] };
  let drafts: Draft[] = [];
  let hookSeen = false;
  for (const t of Array.isArray(raw.texts) ? raw.texts : []) {
    let text = cleanText(typeof t.text === 'string' ? t.text : '');
    if (!text) continue;
    if (wordCount(text) > MAX_TEXT_WORDS) {
      text = text.split(/\s+/).slice(0, MAX_TEXT_WORDS).join(' ');
      repairs.push(`shortened a ${t.role} to ${MAX_TEXT_WORDS} words`);
    }
    if (t.role === 'hook' && hookSeen) {
      repairs.push('dropped a second hook text');
      continue;
    }
    const at = t.role === 'hook' ? { s: 0, e: 0 } : anchor(t.take, t.word, `the ${t.role} "${text}"`);
    if (!at) {
      repairs.push(`dropped the ${t.role} "${text}", its word was cut`);
      continue;
    }
    if (t.role === 'hook') hookSeen = true;
    if (t.replaces && overlayIds.has(t.replaces)) replaceOverlayIds.add(t.replaces);
    // The same words as a text that is staying: this one takes its place.
    const twin = input.overlays.find((o) => norm(o.text) === norm(text));
    if (twin) replaceOverlayIds.add(twin.id);
    const min = Math.max(readMs(text), t.role === 'hook' ? HOOK_MIN_MS : 0);
    // Captions own the lower zone when they are on.
    const position: Zone = captionsOn && t.position === 'lower' ? 'center' : ZONES.includes(t.position) ? t.position : 'upper';
    drafts.push({ role: t.role, text, start_ms: Math.max(0, at.s - (t.role === 'hook' ? 0 : TEXT_LEAD_MS)), end_ms: 0, position, min, hold: t.hold });
  }
  drafts.sort((a, b) => a.start_ms - b.start_ms);
  if (drafts.length > MAX_TEXTS) {
    repairs.push(`kept ${MAX_TEXTS} texts, dropped ${drafts.length - MAX_TEXTS}`);
    drafts = drafts.slice(0, MAX_TEXTS);
  }
  drafts.forEach((d, i) => {
    const next = drafts[i + 1]?.start_ms ?? total;
    const want = d.hold === 'to_end' ? total : d.hold === 'until_next_text' ? next : d.start_ms + Math.round(d.min * 1.25);
    d.end_ms = Math.min(total, Math.max(want, d.start_ms + d.min));
    if (d.end_ms - d.start_ms < d.min) d.start_ms = Math.max(0, d.end_ms - d.min);
  });

  const overlap = (a: { start_ms: number; end_ms: number }, b: { start_ms: number; end_ms: number }) => a.start_ms < b.end_ms && b.start_ms < a.end_ms;
  const texts: Draft[] = [];
  for (const d of drafts) {
    if (d.end_ms - d.start_ms < Math.min(d.min, READ_MIN_MS) && d.end_ms - d.start_ms < total) {
      repairs.push(`dropped the ${d.role} "${d.text}", it could not stay up long enough to read`);
      continue;
    }
    // A floating insert covers the middle of the frame.
    if (d.position === 'center' && inserts.some((m) => m.layout !== 'split' && overlap(d, m))) d.position = 'upper';
    let live = texts.filter((t) => overlap(t, d));
    // An earlier text in the same zone ends when this one starts, if it has been read by then.
    for (const t of live) {
      if (t.position !== d.position || d.start_ms - t.start_ms < t.min) continue;
      t.end_ms = d.start_ms;
    }
    live = texts.filter((t) => overlap(t, d));
    if (live.length >= 2) {
      repairs.push(`dropped the ${d.role} "${d.text}", two texts were already on screen`);
      continue;
    }
    if (live.some((t) => t.position === d.position)) {
      const free = ZONES.find((z) => !(captionsOn && z === 'lower') && !live.some((t) => t.position === z));
      if (!free) {
        repairs.push(`dropped the ${d.role} "${d.text}", no clear place for it`);
        continue;
      }
      repairs.push(`moved the ${d.role} "${d.text}" to ${free}, ${d.position} was taken`);
      d.position = free;
    }
    texts.push(d);
  }

  // ---- captions: clear of the plan's text and of the text that is staying
  const staying = input.overlays.filter((o) => !replaceOverlayIds.has(o.id));
  const lowerBusy = staying.some((o) => o.y >= 0.62 && o.y <= 0.8);
  const centerBusy = texts.some((t) => t.position === 'center') || staying.some((o) => o.y >= 0.46 && o.y < 0.62);
  let captionPosition: 'center' | 'lower' = raw.captions?.position === 'center' ? 'center' : 'lower';
  if (captionPosition === 'center' && centerBusy) captionPosition = 'lower';
  if (captionPosition === 'lower' && lowerBusy && !centerBusy) captionPosition = 'center';
  if (captionsOn && captionPosition === 'lower' && lowerBusy) repairs.push('captions share the lower zone with text already on the video');

  // ---- sound
  const useTrack = raw.sound?.use_brief_track === true && input.brief.sound !== null;
  const asked = isInt(raw.sound?.track_volume) ? raw.sound.track_volume : hasSpeech ? BED_DEFAULT : 100;
  const trackVolume = hasSpeech ? Math.max(BED_MIN, Math.min(BED_MAX, asked)) : Math.max(20, Math.min(100, asked));
  if (useTrack && trackVolume !== asked) repairs.push(`set the sound to ${trackVolume}, ${asked} was asked for`);

  const sourceMs = input.takes.reduce((n, t) => n + takeDuration(t), 0);
  const keptMs = pieces.reduce((n, p) => n + (p.outMs - p.inMs), 0);
  const keeps: EditKeep[] = pieces.map((p) => ({ asset_id: input.takes[p.take].assetId, in_ms: p.inMs, out_ms: p.outMs, zoom: p.zoom, speed: p.speed, reason: p.reason }));
  const cutMs = Math.max(0, sourceMs - keptMs);

  const summary = (Array.isArray(raw.summary) ? raw.summary : [])
    .map((s) => cleanText(typeof s === 'string' ? s : '', 110))
    .filter(Boolean)
    .slice(0, 4);
  if (summary.length === 0) summary.push(...defaultSummary(cutMs, texts.length, inserts.length, captionsOn));

  return {
    plan: {
      keeps,
      texts: texts.map(({ role, text, start_ms, end_ms, position }) => ({ role, text, start_ms, end_ms, position })),
      inserts,
      captions: { enabled: captionsOn, position: captionPosition },
      sound: { use_brief_track: useTrack, track_volume: trackVolume, voice_volume: 100 },
      cut_ms: cutMs,
      summary,
      ai,
    },
    replaceOverlayIds: [...replaceOverlayIds],
    repairs,
  };
}

function defaultSummary(cutMs: number, texts: number, inserts: number, captions: boolean): string[] {
  const out: string[] = [];
  const s = Math.round(cutMs / 1000);
  out.push(s >= 1 ? `Cut ${s} ${s === 1 ? 'second' : 'seconds'} of pauses and filler` : 'Kept every take as recorded');
  if (texts) out.push(texts === 1 ? 'Added the hook text' : `Added ${texts} texts`);
  if (inserts) out.push(inserts === 1 ? 'Showed the product once' : `Showed the product ${inserts} times`);
  if (captions) out.push('Turned captions on');
  return out;
}

// ---------------------------------------------------------------- fallback

/**
 * The plan with no model: every take in record order, pauses tightened and
 * filler sounds dropped from the word timings, the brief's hook text on top,
 * captions on, the brief's sound low under the voice.
 */
export function fallbackRawPlan(input: PlannerInput): RawPlan {
  const segments: RawSegment[] = [];
  input.takes.forEach((take, t) => {
    if (take.words.length === 0) {
      segments.push({ take: t, first_word: 0, last_word: 0, framing: 'full', pace: 'normal', reason: 'no speech' });
      return;
    }
    let first = -1;
    take.words.forEach((w, i) => {
      const filler = isFiller(w.w);
      if (!filler && first < 0) first = i;
      const last = filler ? i - 1 : i === take.words.length - 1 ? i : -1;
      if (first >= 0 && last >= first) {
        segments.push({ take: t, first_word: first, last_word: last, framing: 'full', pace: 'normal', reason: 'speech' });
        first = -1;
      }
    });
  });
  const hook = cleanText(input.brief.clips.find((c) => c.onScreen.trim())?.onScreen ?? '');
  const texts: RawText[] = hook && wordCount(hook) <= MAX_TEXT_WORDS ? [{ role: 'hook', text: hook, take: 0, word: 0, hold: 'read', position: 'upper', replaces: '' }] : [];
  return {
    segments,
    texts,
    inserts: [],
    captions: { enabled: true, position: 'lower' },
    sound: { use_brief_track: input.brief.sound !== null, track_volume: BED_DEFAULT },
    summary: [],
  };
}

// ---------------------------------------------------------------- the call

/**
 * Medium effort. The answer is small (word indexes, not times: a few hundred
 * to about 1,500 output tokens), and the judgement that matters, which try of
 * a line to keep and where a sentence really starts, is made in thinking. Low
 * effort skips most of that; high can think past the budget. The phone waits
 * 90 s for the whole request, transcription included, so the call gets 55 s
 * (transcription is capped at 20 s) and a miss becomes the flagged fallback, never a hang. NONI_AI_EDIT_EFFORT
 * overrides it without a deploy of code.
 */
const DEFAULT_EFFORT: Effort = 'medium';
export const PLAN_TIMEOUT_MS = 55_000;
const PLAN_MAX_TOKENS = 12_000;

function effort(): Effort {
  const v = typeof Deno !== 'undefined' ? Deno.env.get('NONI_AI_EDIT_EFFORT') : undefined;
  return v === 'low' || v === 'medium' || v === 'high' ? v : DEFAULT_EFFORT;
}

export async function planEdit(input: PlannerInput, deps: LlmDeps = {}): Promise<PlanResult> {
  const fallback = (reason: string): PlanResult => {
    const { plan, replaceOverlayIds, repairs } = compilePlan(input, fallbackRawPlan(input), false);
    return { plan, replaceOverlayIds, repairs, fallbackReason: reason, runId: null, model: null, usage: null };
  };
  if (!input.takes.some((t) => t.words.length > 0)) return fallback('no speech was heard in any take');

  const frames = (input.frames ?? []).filter((f) => input.takes.some((t) => t.assetId === f.assetId)).slice(0, 6);
  const frameNote = frames.length
    ? `\n\nThe ${frames.length === 1 ? 'image is a frame' : `${frames.length} images are frames`} from ${frames
        .map((f) => `take ${input.takes.findIndex((t) => t.assetId === f.assetId)}`)
        .join(', ')}, in that order. Use them to place text and inserts clear of the face.`
    : '';
  try {
    const { data, runId, model, usage } = await generate<RawPlan>(
      {
        task: 'edit.plan',
        tier: 'writer',
        system: EDIT_PLANNER_SYSTEM,
        context: [input.reference ? `# The reference post this brief was modelled on\n${input.reference}` : '', renderBrief(input)],
        input: `# The takes\n${renderTakes(input.takes, input.brief)}${frameNote}`,
        images: frames.map((f) => f.image),
        schema: EDIT_PLAN_SCHEMA,
        effort: effort(),
        maxTokens: PLAN_MAX_TOKENS,
        companyId: input.companyId,
        timeoutMs: PLAN_TIMEOUT_MS,
      },
      deps,
    );
    const compiled = compilePlan(input, data, true);
    return { ...compiled, fallbackReason: null, runId, model, usage };
  } catch (e) {
    const reason = e instanceof PlanError ? `the plan was not usable: ${e.message}` : `the planner call failed: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`;
    console.warn(`edit planner: ${reason}`);
    return fallback(reason.slice(0, 300));
  }
}
