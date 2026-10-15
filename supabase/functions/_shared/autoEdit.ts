// Auto edit for one raw reel: the creator records the whole post the way
// they would on TikTok (one take or a few), and this turns the takes into
// an edited timeline. Dead air goes (speechRangesFromWords), retakes and
// stumbles Claude flags go, a header lands on each tip the moment it is
// said, the hook sits on top until the first tip, and a feature recording
// pops up when the product is named. Pure except nothing: the edge
// function does the transcribing and the Claude call.

import { speechRangesFromWords, type TranscriptWord } from './cues.ts';

export type AutoTake = { assetId: string; durationMs: number; words: TranscriptWord[] };

export type AutoFeature = { id: string; title: string; description: string; kind: 'clip' | 'still' };

/** What Claude returns, by take and word index. */
export type AutoPlan = {
  hook: string | null;
  headers: { take: number; word: number; text: string }[];
  cuts: { take: number; from: number; to: number }[];
  media: { take: number; from: number; to: number; feature: string }[];
};

export type AutoBlock = { assetId: string; inMs: number; outMs: number };
export type AutoText = { role: 'hook' | 'header'; text: string; startMs: number; endMs: number };
export type AutoMedia = { featureId: string; startMs: number; endMs: number };

export type AutoEditResult = {
  blocks: AutoBlock[];
  texts: AutoText[];
  media: AutoMedia[];
  /** Source time removed: dead air, retakes, stumbles. */
  cutMs: number;
};

export const MIN_PIECE_MS = 300;
export const MAX_PIECES = 60;
const HEADER_LEAD_MS = 150;
const HOOK_MIN_MS = 1200;
const MEDIA_MIN_MS = 2500;
const MEDIA_MAX_MS = 8000;
const CUT_EDGE_PAD_MS = 80;
const MAX_HEADERS = 12;
const MAX_MEDIA = 3;
const MAX_TEXT_CHARS = 48;

type Range = { startMs: number; endMs: number };

/** No dashes as punctuation, no emoji, one line, capped. */
export function cleanText(raw: string): string {
  return raw
    .replace(/\s+[—–-]+\s+/g, ', ')
    .replace(/[—–]/g, ' ')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“‘]+|["'”’]+$/g, '')
    .slice(0, MAX_TEXT_CHARS)
    .trim();
}

function int(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null;
}

/** Claude's JSON checked against the takes and features; bad entries drop. */
export function parsePlan(raw: unknown, takes: AutoTake[], featureIds: string[]): AutoPlan {
  const plan: AutoPlan = { hook: null, headers: [], cuts: [], media: [] };
  if (typeof raw !== 'object' || raw === null) return plan;
  const r = raw as Record<string, unknown>;
  const wordOk = (take: number | null, word: number | null) =>
    take !== null && word !== null && take >= 0 && take < takes.length && word >= 0 && word < takes[take].words.length;

  if (typeof r.hook === 'string') {
    const hook = cleanText(r.hook);
    plan.hook = hook || null;
  }
  for (const h of Array.isArray(r.headers) ? r.headers : []) {
    if (typeof h !== 'object' || h === null) continue;
    const take = int((h as Record<string, unknown>).take);
    const word = int((h as Record<string, unknown>).word);
    const text = typeof (h as Record<string, unknown>).text === 'string' ? cleanText((h as { text: string }).text) : '';
    if (!wordOk(take, word) || !text) continue;
    plan.headers.push({ take: take!, word: word!, text });
  }
  plan.headers = plan.headers.slice(0, MAX_HEADERS);
  for (const c of Array.isArray(r.cuts) ? r.cuts : []) {
    if (typeof c !== 'object' || c === null) continue;
    const take = int((c as Record<string, unknown>).take);
    const from = int((c as Record<string, unknown>).from);
    const to = int((c as Record<string, unknown>).to);
    if (!wordOk(take, from) || !wordOk(take, to) || to! < from!) continue;
    plan.cuts.push({ take: take!, from: from!, to: to! });
  }
  for (const m of Array.isArray(r.media) ? r.media : []) {
    if (typeof m !== 'object' || m === null) continue;
    const take = int((m as Record<string, unknown>).take);
    const from = int((m as Record<string, unknown>).from);
    const to = int((m as Record<string, unknown>).to);
    const feature = (m as Record<string, unknown>).feature;
    if (!wordOk(take, from) || !wordOk(take, to) || to! < from!) continue;
    if (typeof feature !== 'string' || !featureIds.includes(feature)) continue;
    plan.media.push({ take: take!, from: from!, to: to!, feature });
  }
  plan.media = plan.media.slice(0, MAX_MEDIA);
  return plan;
}

/** The source span a cut removes, eased to the words around it so neighbours stay whole. */
function cutSpan(words: TranscriptWord[], from: number, to: number, durationMs: number): Range {
  const before = from > 0 ? words[from - 1].e : 0;
  const after = to < words.length - 1 ? words[to + 1].s : durationMs;
  const startMs = from > 0 ? Math.max(before, words[from].s - CUT_EDGE_PAD_MS) : 0;
  const endMs = to < words.length - 1 ? Math.min(after, words[to].e + CUT_EDGE_PAD_MS) : durationMs;
  return { startMs, endMs: Math.max(startMs, endMs) };
}

function subtract(keep: Range[], cuts: Range[]): Range[] {
  let out = keep;
  for (const cut of cuts) {
    const next: Range[] = [];
    for (const r of out) {
      if (cut.endMs <= r.startMs || cut.startMs >= r.endMs) {
        next.push(r);
        continue;
      }
      if (cut.startMs > r.startMs) next.push({ startMs: r.startMs, endMs: cut.startMs });
      if (cut.endMs < r.endMs) next.push({ startMs: cut.endMs, endMs: r.endMs });
    }
    out = next;
  }
  return out;
}

/** Fewer pieces than the document allows: close the smallest gaps inside one take first. */
function capPieces(pieces: (Range & { take: number })[], max: number): (Range & { take: number })[] {
  const out = [...pieces];
  while (out.length > max) {
    let best = -1;
    let gap = Infinity;
    for (let i = 0; i < out.length - 1; i++) {
      if (out[i].take !== out[i + 1].take) continue;
      const g = out[i + 1].startMs - out[i].endMs;
      if (g < gap) {
        gap = g;
        best = i;
      }
    }
    if (best < 0) break;
    out.splice(best, 2, { take: out[best].take, startMs: out[best].startMs, endMs: out[best + 1].endMs });
  }
  return out;
}

export function buildAutoEdit(takes: AutoTake[], plan: AutoPlan): AutoEditResult {
  let pieces: (Range & { take: number })[] = [];
  let sourceMs = 0;
  takes.forEach((take, t) => {
    sourceMs += take.durationMs;
    const speech = speechRangesFromWords(take.words, take.durationMs);
    const keep: Range[] = speech ? speech.keep : take.durationMs > 0 ? [{ startMs: 0, endMs: take.durationMs }] : [];
    const cuts = plan.cuts.filter((c) => c.take === t).map((c) => cutSpan(take.words, c.from, c.to, take.durationMs));
    for (const r of subtract(keep, cuts)) {
      const startMs = Math.max(0, Math.round(r.startMs));
      const endMs = Math.min(take.durationMs, Math.round(r.endMs));
      if (endMs - startMs >= MIN_PIECE_MS) pieces.push({ take: t, startMs, endMs });
    }
  });
  pieces = capPieces(pieces, MAX_PIECES);

  // Output clock: each piece plays back to back.
  const placed: (Range & { take: number; outStart: number })[] = [];
  let cursor = 0;
  for (const p of pieces) {
    placed.push({ ...p, outStart: cursor });
    cursor += p.endMs - p.startMs;
  }
  const total = cursor;

  /** Source ms in a take to output ms; a cut moment lands where the next kept piece starts. */
  const toOut = (take: number, ms: number): number => {
    const own = placed.filter((p) => p.take === take);
    for (const p of own) {
      if (ms < p.startMs) return p.outStart;
      if (ms <= p.endMs) return p.outStart + (ms - p.startMs);
    }
    const later = placed.find((p) => p.take > take);
    if (later) return later.outStart;
    const last = own[own.length - 1];
    return last ? last.outStart + (last.endMs - last.startMs) : total;
  };
  /** True when a word survived the cuts. */
  const kept = (take: number, word: TranscriptWord) =>
    placed.some((p) => p.take === take && word.s < p.endMs && word.e > p.startMs);

  const headerStarts = plan.headers
    .filter((h) => kept(h.take, takes[h.take].words[h.word]))
    .map((h) => ({ text: h.text, startMs: Math.max(0, toOut(h.take, takes[h.take].words[h.word].s) - HEADER_LEAD_MS) }))
    .sort((a, b) => a.startMs - b.startMs)
    .filter((h, i, arr) => h.startMs < total - MIN_PIECE_MS && (i === 0 || h.startMs - arr[i - 1].startMs >= MIN_PIECE_MS));

  const texts: AutoText[] = [];
  if (plan.hook && total > 0) {
    const firstHeader = headerStarts[0]?.startMs ?? total;
    if (firstHeader >= HOOK_MIN_MS) texts.push({ role: 'hook', text: plan.hook, startMs: 0, endMs: firstHeader });
  }
  headerStarts.forEach((h, i) => {
    texts.push({ role: 'header', text: h.text, startMs: h.startMs, endMs: headerStarts[i + 1]?.startMs ?? total });
  });

  const media: AutoMedia[] = [];
  for (const m of [...plan.media].sort((a, b) => a.take - b.take || a.from - b.from)) {
    const words = takes[m.take].words;
    const startMs = Math.max(0, toOut(m.take, words[m.from].s) - HEADER_LEAD_MS);
    let endMs = toOut(m.take, words[m.to].e);
    endMs = Math.min(total, Math.max(endMs, startMs + MEDIA_MIN_MS), startMs + MEDIA_MAX_MS);
    if (endMs - startMs < MIN_PIECE_MS) continue;
    const prev = media[media.length - 1];
    if (prev && startMs < prev.endMs) {
      if (prev.featureId === m.feature) prev.endMs = Math.max(prev.endMs, endMs);
      continue;
    }
    media.push({ featureId: m.feature, startMs, endMs });
  }

  return {
    blocks: placed.map((p) => ({ assetId: takes[p.take].assetId, inMs: p.startMs, outMs: p.endMs })),
    texts,
    media,
    cutMs: Math.max(0, sourceMs - total),
  };
}

// ---- Prompt ----

export type AutoBrief = {
  title: string;
  postTypeKey: string | null;
  postTypeName: string | null;
  note: string | null;
  cta: string | null;
  points: string[];
  companyName: string | null;
};

const LIST_TYPES = new Set(['numbered_list', 'how_to_reel', 'numbered_tips', 'how_to', 'myths']);
const ONE_CLIP_TYPES = new Set(['seven_second', 'long_text', 'replay_bait']);

function typeRule(key: string | null): string {
  if (key && LIST_TYPES.has(key)) {
    return 'This is a list post. Put one header on the first word of each tip or step, numbered in the order they say them: "1. Best plays first". If they skip a number or say them out of order, number them as they come.';
  }
  if (key && ONE_CLIP_TYPES.has(key)) {
    return 'This is a short one clip post. Hook only, no headers.';
  }
  return 'This is a talking post. Usually the hook alone is right. Add headers only if they clearly walk through separate points, numbered the same way.';
}

export function autoEditPrompt(brief: AutoBrief, takes: AutoTake[], features: AutoFeature[]): { system: string; user: string } {
  const system = [
    'You edit raw TikTok and Instagram reels a creator just recorded on their phone.',
    'You get the transcript of every take with word indexes. You decide three things and return JSON only.',
    '',
    '1. cuts: retakes and stumbles. When they start a sentence, stop, and say it again, cut the earlier attempt and keep the last clean one. Cut "wait", "let me start over", "okay again", false starts, and anything said to someone off camera. If a whole take is a redo of an earlier take, cut the earlier one. Never cut the only version of something, never cut the product mention, never cut normal speech just to shorten it. Pauses are already handled, do not cut for silence.',
    '2. hook and headers: on screen text. The hook sits on top until the first header: 3 to 9 words, the punchy version of what they open with (or the post title if they basically said it). Headers are 2 to 6 words after the number, in their own words, never a summary or a label like "Tip one". Sentence case, no emoji, no dashes, no quotes.',
    '3. media: when they name the product or describe what one of its features does, show that feature. Use the given feature ids only, at most 3, empty when nothing fits.',
    '',
    'Indexes are [take, word]. from and to are inclusive word indexes in one take. headers.word is the first word of that tip.',
    'Return exactly: {"hook": string|null, "headers": [{"take":0,"word":12,"text":"1. Best plays first"}], "cuts": [{"take":0,"from":5,"to":11}], "media": [{"take":0,"from":40,"to":44,"feature":"<id>"}]}',
  ].join('\n');

  const lines: string[] = [];
  lines.push(`Post title: ${brief.title || '(none, freestyle)'}`);
  if (brief.postTypeName) lines.push(`Post type: ${brief.postTypeName}`);
  lines.push(typeRule(brief.postTypeKey));
  if (brief.note) lines.push(`Note from the brand: ${brief.note}`);
  if (brief.points.length) lines.push(`Ideas the brief suggested (they may say others): ${brief.points.join(' | ')}`);
  if (brief.companyName) lines.push(`Product: ${brief.companyName}`);
  if (brief.cta) lines.push(`Plug: ${brief.cta}`);
  if (features.length) {
    lines.push('Features with media:');
    for (const f of features) lines.push(`- ${f.id}: ${f.title}${f.description ? `. ${f.description.slice(0, 160)}` : ''} (${f.kind === 'clip' ? 'screen recording' : 'screenshot'})`);
  }
  lines.push('');
  takes.forEach((take, t) => {
    lines.push(`Take ${t}:`);
    lines.push(take.words.length ? take.words.map((w, i) => `[${i}]${w.w}`).join(' ') : '(no speech)');
  });
  return { system, user: lines.join('\n') };
}

/** The plan when Claude is down: the post title as the hook, nothing else. */
export function fallbackPlan(brief: AutoBrief): AutoPlan {
  const hook = cleanText(brief.title);
  return { hook: hook || null, headers: [], cuts: [], media: [] };
}
