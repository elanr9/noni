// Edit my video, app side. The creator records raw takes (each one a full
// block on the timeline); the auto-edit edge function transcribes them and
// sends back the cut: kept ranges, the hook, a header per tip and when a
// feature recording should pop up. applyAutoEdit turns that into the studio
// document in one step, so undo goes back to the raw takes. The takes and
// their words ride in the document (autoEdit) so captions preview on the
// phone and adding a take later reruns the edit on every take.

import {
  addAsset,
  documentDurationMs,
  EDIT_DOCUMENT_VERSION,
  MAX_BLOCKS,
  MIN_CLIP_MS,
  newId,
  type Block,
  type ImageOverlay,
  type MediaAsset,
  type Overlay,
  type TextOverlay,
  type VideoDocument,
} from './edit-document';
import type { LibraryFeature } from './library-api';
import { CLASSIC_TEXT_COLOR } from './overlay-boxes';
import { supabase } from './supabase';
import type { Json } from './types';

export type Word = { w: string; s: number; e: number };

/** What the document keeps about the last auto edit. */
export type AutoEditState = {
  v: 1;
  /** Every raw take, in record order, as it was when the edit ran. */
  takes: MediaAsset[];
  /** Words per take asset id, in that take's own clock: [word, startMs, endMs]. */
  words: Record<string, [string, number, number][]>;
  /** Take ids the edit ran on; a different set means it should run again. */
  ranFor: string | null;
  cutMs: number;
  ai: boolean;
};

export type AutoEditReply = {
  takes: { asset_id: string; duration_ms: number; words: Word[] }[];
  blocks: { asset_id: string; in_ms: number; out_ms: number }[];
  texts: { role: 'hook' | 'header'; text: string; start_ms: number; end_ms: number }[];
  media: { feature_id: string; start_ms: number; end_ms: number }[];
  cut_ms: number;
  ai: boolean;
};

/** Where the hook and headers sit: high, so captions and the face stay clear. */
export const HEADER_Y = 0.2;
export const HEADER_SIZE = 0.052;
const CLIP_MEDIA = { x: 0.5, y: 0.5, width: 0.42 } as const;
const STILL_MEDIA = { x: 0.5, y: 0.5, width: 0.62 } as const;
const FEATURE_ASSET_PREFIX = 'feat-';
const CALL_TIMEOUT_MS = 90_000;

function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseAsset(raw: unknown): MediaAsset | null {
  if (!isRec(raw) || typeof raw.id !== 'string' || (raw.kind !== 'video' && raw.kind !== 'image')) return null;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const s = (v: unknown) => (typeof v === 'string' && v ? v : null);
  return {
    id: raw.id,
    kind: raw.kind,
    localUri: s(raw.localUri),
    storagePath: s(raw.storagePath),
    durationMs: n(raw.durationMs),
    width: n(raw.width),
    height: n(raw.height),
  };
}

export function readAutoEdit(doc: VideoDocument): AutoEditState | null {
  const raw = doc.autoEdit;
  if (!isRec(raw) || raw.v !== 1) return null;
  const takes = Array.isArray(raw.takes) ? raw.takes.map(parseAsset).filter((a): a is MediaAsset => a !== null) : [];
  const words: AutoEditState['words'] = {};
  if (isRec(raw.words)) {
    for (const [id, list] of Object.entries(raw.words)) {
      if (!Array.isArray(list)) continue;
      words[id] = list.filter(
        (w): w is [string, number, number] => Array.isArray(w) && typeof w[0] === 'string' && typeof w[1] === 'number' && typeof w[2] === 'number',
      );
    }
  }
  return {
    v: 1,
    takes,
    words,
    ranFor: typeof raw.ranFor === 'string' ? raw.ranFor : null,
    cutMs: typeof raw.cutMs === 'number' ? raw.cutMs : 0,
    ai: raw.ai === true,
  };
}

function withState(doc: VideoDocument, state: AutoEditState): VideoDocument {
  return { ...doc, autoEdit: JSON.parse(JSON.stringify(state)) as Json };
}

export function isFeatureAsset(asset: Pick<MediaAsset, 'id'>): boolean {
  return asset.id.startsWith(FEATURE_ASSET_PREFIX);
}

/**
 * Every raw take in record order: the ones the last edit knew (fresh from
 * the document when it still holds them, so upload paths are current), then
 * any recorded since.
 */
export function takesOf(doc: VideoDocument): MediaAsset[] {
  const state = readAutoEdit(doc);
  const live = new Map(doc.assets.map((a) => [a.id, a]));
  const known = (state?.takes ?? []).map((t) => live.get(t.id) ?? t);
  const knownIds = new Set(known.map((t) => t.id));
  const fresh = doc.assets.filter((a) => a.kind === 'video' && !isFeatureAsset(a) && !knownIds.has(a.id));
  return [...known, ...fresh];
}

export function takeKey(takes: MediaAsset[]): string {
  return takes.map((t) => t.id).join(',');
}

/** True when there are takes the current timeline was not cut from. */
export function needsAutoEdit(doc: VideoDocument): boolean {
  const takes = takesOf(doc);
  if (takes.length === 0) return false;
  return readAutoEdit(doc)?.ranFor !== takeKey(takes);
}

/** Remember the words heard in one take (the per clip head start). */
export function rememberWords(doc: VideoDocument, assetId: string, words: Word[]): VideoDocument {
  const takes = takesOf(doc);
  const state = readAutoEdit(doc);
  return withState(doc, {
    v: 1,
    takes,
    words: { ...(state?.words ?? {}), [assetId]: words.map((w) => [w.w, w.s, w.e]) },
    ranFor: state?.ranFor ?? null,
    cutMs: state?.cutMs ?? 0,
    ai: state?.ai ?? false,
  });
}

/** Uploaded takes nobody has listened to yet. */
export function unheardTakes(doc: VideoDocument): MediaAsset[] {
  const words = readAutoEdit(doc)?.words ?? {};
  return takesOf(doc).filter((t) => t.storagePath && !(t.id in words));
}

/** Keep the timeline as it is and stop asking to auto edit these takes (Edit by hand). */
export function skipAutoEdit(doc: VideoDocument): VideoDocument {
  const takes = takesOf(doc);
  const state = readAutoEdit(doc);
  return withState(doc, { v: 1, takes, words: state?.words ?? {}, ranFor: takeKey(takes), cutMs: state?.cutMs ?? 0, ai: state?.ai ?? false });
}

/** Ask for a fresh auto edit of the same takes (Redo). */
export function forgetAutoEdit(doc: VideoDocument): VideoDocument {
  const takes = takesOf(doc);
  const state = readAutoEdit(doc);
  return withState(doc, { v: 1, takes, words: state?.words ?? {}, ranFor: null, cutMs: state?.cutMs ?? 0, ai: state?.ai ?? false });
}

/** A new raw take: its own full block at the end, and on the take list. */
export function addTake(doc: VideoDocument, asset: MediaAsset): VideoDocument {
  const takes = [...takesOf(doc), asset];
  const block: Block = {
    id: newId('b'),
    layout: 'single',
    cells: [
      {
        id: newId('c'),
        assetId: asset.id,
        inMs: 0,
        outMs: asset.kind === 'video' ? (asset.durationMs ?? 0) : 3000,
        speed: 1,
        muted: asset.kind === 'image',
        crop: null,
      },
    ],
  };
  const next = addAsset(doc, asset);
  const state = readAutoEdit(doc);
  return withState(
    { ...next, blocks: [...next.blocks, block] },
    { v: 1, takes, words: state?.words ?? {}, ranFor: state?.ranFor ?? null, cutMs: state?.cutMs ?? 0, ai: state?.ai ?? false },
  );
}

/**
 * Drop the last take. Before any edit ran the timeline is just the takes, so
 * its block goes; after an edit every block cut from it goes too.
 */
export function removeLastTake(doc: VideoDocument): VideoDocument {
  const takes = takesOf(doc);
  const last = takes[takes.length - 1];
  if (!last) return doc;
  const blocks = doc.blocks.filter((b) => !b.cells.some((c) => c.assetId === last.id));
  const state = readAutoEdit(doc);
  const words = { ...(state?.words ?? {}) };
  delete words[last.id];
  return withState(
    { ...doc, blocks, assets: doc.assets.filter((a) => a.id !== last.id) },
    { v: 1, takes: takes.slice(0, -1), words, ranFor: state?.ranFor ?? null, cutMs: state?.cutMs ?? 0, ai: state?.ai ?? false },
  );
}

/** Raw takes total length, for the camera's progress bar. */
export function takesDurationMs(doc: VideoDocument): number {
  return takesOf(doc).reduce((sum, t) => sum + (t.durationMs ?? 0), 0);
}

// ---- The call ----

export type AutoFeatureInput = { id: string; title: string; description: string; kind: 'clip' | 'still'; path: string };

/** Features the edit may pop up: only ones with media stored in our own bucket. */
export function autoFeatures(features: LibraryFeature[]): AutoFeatureInput[] {
  const out: AutoFeatureInput[] = [];
  for (const f of features) {
    const clip = f.mediaPaths?.clip ?? null;
    const still = f.mediaPaths?.still ?? null;
    const path = clip ?? still;
    if (!path) continue;
    out.push({ id: f.id, title: f.title, description: f.description, kind: clip ? 'clip' : 'still', path });
  }
  return out.slice(0, 12);
}

async function errorMessage(error: unknown): Promise<string> {
  const ctx = (error as { context?: { json?: () => Promise<unknown>; status?: number } }).context;
  const status = ctx?.status;
  const body = typeof ctx?.json === 'function' ? ((await ctx.json().catch(() => null)) as { error?: unknown; code?: unknown } | null) : null;
  if (status === 404 || body?.code === 'NOT_FOUND') return 'Auto edit is not set up on the server yet. Deploy the auto-edit function.';
  if (typeof body?.error === 'string') return body.error;
  return status ? `Auto edit failed (${status}). Try again.` : 'Auto edit failed. Try again.';
}

export async function runAutoEdit(params: {
  assignmentId: string;
  takes: MediaAsset[];
  features: AutoFeatureInput[];
  /** Words already heard per take id; those takes skip transcription on the server. */
  words?: AutoEditState['words'];
  /** 'words' only transcribes and returns, for the head start while the creator keeps recording. */
  mode?: 'words';
}): Promise<AutoEditReply> {
  const body = {
    assignment_id: params.assignmentId,
    takes: params.takes.map((t) => {
      const known = params.words?.[t.id];
      return {
        asset_id: t.id,
        storage_path: t.storagePath,
        duration_ms: t.durationMs ?? 0,
        ...(known ? { words: known.map(([w, s, e]) => ({ w, s, e })) } : {}),
      };
    }),
    features: params.features.map(({ id, title, description, kind }) => ({ id, title, description, kind })),
    ...(params.mode ? { mode: params.mode } : {}),
  };
  const call = supabase.functions.invoke('auto-edit', { body });
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Auto edit took too long. Try again.')), CALL_TIMEOUT_MS));
  const { data, error } = await Promise.race([call, timeout]);
  if (error) throw new Error(await errorMessage(error));
  const raw = (data ?? {}) as Partial<AutoEditReply> & { error?: unknown };
  if (typeof raw.error === 'string') throw new Error(raw.error);
  return {
    takes: Array.isArray(raw.takes) ? raw.takes : [],
    blocks: Array.isArray(raw.blocks) ? raw.blocks : [],
    texts: Array.isArray(raw.texts) ? raw.texts : [],
    media: Array.isArray(raw.media) ? raw.media : [],
    cut_ms: typeof raw.cut_ms === 'number' ? raw.cut_ms : 0,
    ai: raw.ai === true,
  };
}

// ---- Applying it ----

function featureAsset(f: AutoFeatureInput): MediaAsset {
  return {
    id: `${FEATURE_ASSET_PREFIX}${f.id}`,
    kind: f.kind === 'clip' ? 'video' : 'image',
    localUri: null,
    storagePath: f.path,
    durationMs: null,
    width: null,
    height: null,
  };
}

/**
 * The edited timeline from the reply. Blocks are rebuilt from the takes,
 * overlays from the hook, headers and media; the creator's own manual text
 * from before is dropped, since it was timed to the raw takes.
 */
export function applyAutoEdit(
  doc: VideoDocument,
  takes: MediaAsset[],
  reply: AutoEditReply,
  features: AutoFeatureInput[],
): VideoDocument {
  const takeById = new Map(takes.map((t) => [t.id, t]));
  const blocks: Block[] = [];
  for (const b of reply.blocks) {
    const take = takeById.get(b.asset_id);
    if (!take) continue;
    const max = take.durationMs ?? b.out_ms;
    const inMs = Math.max(0, Math.min(b.in_ms, max));
    const outMs = Math.max(inMs, Math.min(b.out_ms, max));
    if (outMs - inMs < MIN_CLIP_MS) continue;
    blocks.push({
      id: newId('b'),
      layout: 'single',
      cells: [{ id: newId('c'), assetId: take.id, inMs, outMs, speed: 1, muted: false, crop: null }],
    });
  }
  // Nothing usable came back: keep every take whole.
  if (blocks.length === 0) {
    for (const take of takes) {
      blocks.push({
        id: newId('b'),
        layout: 'single',
        cells: [{ id: newId('c'), assetId: take.id, inMs: 0, outMs: take.durationMs ?? 0, speed: 1, muted: false, crop: null }],
      });
    }
  }

  const assets = new Map<string, MediaAsset>();
  for (const take of takes) assets.set(take.id, take);
  const featureById = new Map(features.map((f) => [f.id, f]));

  let next: VideoDocument = {
    version: EDIT_DOCUMENT_VERSION,
    format: 'video',
    aspect: '9:16',
    assets: [...assets.values()],
    blocks: blocks.slice(0, MAX_BLOCKS),
    overlays: [],
    gain: doc.gain,
    subtitles: { enabled: true, y: doc.subtitles.y },
  };
  const total = documentDurationMs(next);
  const clamp = (start: number, end: number) => {
    const startMs = Math.max(0, Math.min(start, total));
    return { startMs, endMs: Math.max(startMs, Math.min(end, total)) };
  };

  const overlays: Overlay[] = [];
  for (const t of reply.texts) {
    const win = clamp(t.start_ms, t.end_ms);
    if (!t.text.trim() || win.endMs - win.startMs < 200) continue;
    const overlay: TextOverlay = {
      kind: 'text',
      id: newId('o'),
      text: t.text.trim(),
      color: CLASSIC_TEXT_COLOR,
      bg: true,
      size: HEADER_SIZE,
      x: 0.5,
      y: HEADER_Y,
      width: 0.86,
      ...win,
      enter: 'pop',
    };
    overlays.push(overlay);
  }
  for (const m of reply.media) {
    const f = featureById.get(m.feature_id);
    if (!f) continue;
    const win = clamp(m.start_ms, m.end_ms);
    if (win.endMs - win.startMs < 200) continue;
    const asset = featureAsset(f);
    next = addAsset(next, asset);
    const place = f.kind === 'clip' ? CLIP_MEDIA : STILL_MEDIA;
    const overlay: ImageOverlay = { kind: 'image', id: newId('o'), assetId: asset.id, ...place, ...win, enter: 'slide' };
    overlays.push(overlay);
  }
  next = { ...next, overlays };

  const words: AutoEditState['words'] = {};
  for (const t of reply.takes) words[t.asset_id] = t.words.map((w) => [w.w, w.s, w.e]);
  return withState(next, { v: 1, takes, words, ranFor: takeKey(takes), cutMs: reply.cut_ms, ai: reply.ai });
}

// ---- Captions preview ----

export type CaptionLine = { text: string; startMs: number; endMs: number };

const CAPTION_MAX_CHARS = 32;
const CAPTION_PAUSE_MS = 600;
const CAPTION_MIN_MS = 600;

/** Words on the output clock, through every trim and speed (mirrors the render's outputWords). */
export function outputWords(doc: VideoDocument): Word[] {
  const state = readAutoEdit(doc);
  if (!state) return [];
  const out: Word[] = [];
  let cursor = 0;
  for (const block of doc.blocks) {
    const blockMs = Math.min(...block.cells.map((c) => (c.outMs - c.inMs) / c.speed));
    for (const cell of block.cells) {
      if (cell.muted) continue;
      const list = state.words[cell.assetId];
      if (!list) continue;
      const end = cell.inMs + blockMs * cell.speed;
      for (const [w, s, e] of list) {
        if (e <= cell.inMs || s >= end) continue;
        out.push({ w, s: Math.round(cursor + Math.max(0, (s - cell.inMs) / cell.speed)), e: Math.round(cursor + Math.min(blockMs, (e - cell.inMs) / cell.speed)) });
      }
    }
    cursor += blockMs;
  }
  return out.sort((a, b) => a.s - b.s);
}

/** Short caption lines: break on sentence ends, long pauses and length. */
export function captionLines(words: Word[]): CaptionLine[] {
  const lines: CaptionLine[] = [];
  let group: Word[] = [];
  let chars = 0;
  const flush = () => {
    if (group.length) {
      const startMs = group[0].s;
      lines.push({ text: group.map((w) => w.w).join(' '), startMs, endMs: Math.max(group[group.length - 1].e, startMs + CAPTION_MIN_MS) });
    }
    group = [];
    chars = 0;
  };
  for (const word of words) {
    const prev = group[group.length - 1];
    if (prev && (chars + 1 + word.w.length > CAPTION_MAX_CHARS || word.s - prev.e > CAPTION_PAUSE_MS)) flush();
    group.push(word);
    chars += (group.length > 1 ? 1 : 0) + word.w.length;
    if (/[.?!]["')\]]*$/.test(word.w)) flush();
  }
  flush();
  for (let i = 0; i < lines.length - 1; i++) lines[i].endMs = Math.min(lines[i].endMs, lines[i + 1].startMs);
  return lines;
}

export function captionAt(lines: CaptionLine[], ms: number): CaptionLine | null {
  for (const line of lines) if (ms >= line.startMs && ms < line.endMs) return line;
  return null;
}
