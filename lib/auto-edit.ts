// Edit my video, app side. The creator records raw takes (each one a full
// block on the timeline); the auto-edit edge function transcribes them and
// sends back the cut: kept ranges, the hook, a header per tip and when a
// feature recording should pop up. applyAutoEdit turns that into the studio
// document in one step, so undo goes back to the raw takes. The takes and
// their words ride in the document (autoEdit) so captions preview on the
// phone and adding a take later reruns the edit on every take.
//
// Auto edit in the v2 editor goes through the edit plan instead: the server
// plans the whole edit (requestEditPlan), applyEditPlan maps it onto the
// document, and the plan, what the document looked like before and what it
// looked like right after ride in autoEdit.applied. That is the one step undo
// (undoEditPlan) and, once the document is frozen into the submission, the
// record of what the creator and the manager changed after the AI edit.

import type { AudioTrack, PostAudio } from './brief-library';
import {
  addAsset,
  blockDurationMs,
  blockRanges,
  documentDurationMs,
  EDIT_DOCUMENT_VERSION,
  MAX_BLOCKS,
  MAX_OVERLAYS,
  MIN_CLIP_MS,
  MIN_OVERLAY_MS,
  newId,
  pruneAssets,
  type Block,
  type Clip,
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
  /** The edit plan now on the timeline; absent before one runs and after an undo. */
  applied?: AppliedEdit | null;
};

// ---- The edit plan (mirrors supabase/functions/_shared/ai/contracts.ts) ----

export type EditKeep = { asset_id: string; in_ms: number; out_ms: number; zoom: number; speed: 1 | 1.5 | 2; reason: string };
export type EditText = { role: 'hook' | 'header' | 'label' | 'cta'; text: string; start_ms: number; end_ms: number; position: 'top' | 'upper' | 'center' | 'lower' };
export type EditInsert = { media_id: string; start_ms: number; end_ms: number; layout: 'overlay' | 'split' | 'full' };
export type EditPlan = {
  keeps: EditKeep[];
  texts: EditText[];
  inserts: EditInsert[];
  captions: { enabled: boolean; position: 'center' | 'lower' };
  sound: { use_brief_track: boolean; track_volume: number; voice_volume: number };
  cut_ms: number;
  summary: string[];
  ai: boolean;
};

/** The parts of the document an edit plan rewrites. */
export type EditSnapshot = {
  assets: MediaAsset[];
  blocks: Block[];
  overlays: Overlay[];
  subtitles: VideoDocument['subtitles'];
  audio: PostAudio | null;
};

export type AppliedEdit = {
  at: string;
  /** ai_runs id of the planner call; null for the fallback. */
  runId: string | null;
  plan: EditPlan;
  /** Why the plan is the plain trim and not the model's; null when the model planned it. */
  fallbackReason: string | null;
  /** The timeline before the plan, for undo. */
  before: EditSnapshot;
  /** The timeline right after the plan. The document's own blocks and overlays are what it became. */
  result: EditSnapshot;
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
    ...(isApplied(raw.applied) ? { applied: raw.applied } : {}),
  };
}

function isSnapshot(v: unknown): v is EditSnapshot {
  return isRec(v) && Array.isArray(v.assets) && Array.isArray(v.blocks) && Array.isArray(v.overlays) && isRec(v.subtitles);
}

function isApplied(v: unknown): v is AppliedEdit {
  return isRec(v) && isRec(v.plan) && Array.isArray(v.plan.keeps) && Array.isArray(v.plan.summary) && isSnapshot(v.before) && isSnapshot(v.result);
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
    ai: state?.ai ?? false, applied: state?.applied ?? null,
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
  return withState(doc, { v: 1, takes, words: state?.words ?? {}, ranFor: takeKey(takes), cutMs: state?.cutMs ?? 0, ai: state?.ai ?? false, applied: state?.applied ?? null });
}

/** Ask for a fresh auto edit of the same takes (Redo). */
export function forgetAutoEdit(doc: VideoDocument): VideoDocument {
  const takes = takesOf(doc);
  const state = readAutoEdit(doc);
  return withState(doc, { v: 1, takes, words: state?.words ?? {}, ranFor: null, cutMs: state?.cutMs ?? 0, ai: state?.ai ?? false, applied: state?.applied ?? null });
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
    { v: 1, takes, words: state?.words ?? {}, ranFor: state?.ranFor ?? null, cutMs: state?.cutMs ?? 0, ai: state?.ai ?? false, applied: state?.applied ?? null },
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
    { v: 1, takes: takes.slice(0, -1), words, ranFor: state?.ranFor ?? null, cutMs: state?.cutMs ?? 0, ai: state?.ai ?? false, applied: state?.applied ?? null },
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

// ---- The edit plan ----

export type EditPlanReply = {
  takes: AutoEditReply['takes'];
  plan: EditPlan;
  /** Existing text overlays the plan's texts take the place of. */
  replaceOverlayIds: string[];
  /** What the server corrected in the model's plan. */
  repairs: string[];
  /** Set when the model did not plan this edit: the plan is the plain trim. */
  fallbackReason: string | null;
  /** Takes the server could not listen to; they stay whole. */
  unheard: string[];
  /** The brief's sound, when the plan uses it. */
  soundTrack: AudioTrack | null;
  /** Everything the plan may insert: the features sent, plus media the server added from the company brain. */
  media: AutoFeatureInput[];
  runId: string | null;
};

/**
 * The takes an edit plan works from. After an earlier edit that is every
 * take it knew, in the same order, plus any recorded since (a take the plan
 * cut whole is still a take). Before one, the video clips in timeline order.
 */
export function timelineTakes(doc: VideoDocument): MediaAsset[] {
  const all = takesOf(doc);
  if (readAutoEdit(doc)?.takes.length) return all;
  const byId = new Map(all.map((t) => [t.id, t]));
  const out: MediaAsset[] = [];
  for (const block of doc.blocks) {
    const take = byId.get(block.cells[0]?.assetId ?? '');
    if (take && !out.includes(take)) out.push(take);
  }
  return out;
}

/** Overlays the last edit plan made that nobody has touched since; a new plan makes its own. */
function untouchedPlanOverlays(doc: VideoDocument): Set<string> {
  const applied = readAutoEdit(doc)?.applied;
  const out = new Set<string>();
  if (!applied) return out;
  const before = new Set(applied.before.overlays.map((o) => o.id));
  const made = new Map(applied.result.overlays.filter((o) => !before.has(o.id)).map((o) => [o.id, JSON.stringify(o)]));
  for (const o of doc.overlays) if (made.get(o.id) === JSON.stringify(o)) out.add(o.id);
  return out;
}

/** The brief clip each take was recorded for, from the camera's block ids (b-<slot>-<asset>). */
export function takeSlots(doc: VideoDocument): Record<string, number> {
  const out: Record<string, number> = {};
  for (const block of doc.blocks) {
    const cell = block.cells[0];
    const m = /^b-(\d+)-/.exec(block.id);
    if (cell && m && !(cell.assetId in out)) out[cell.assetId] = Number(m[1]);
  }
  return out;
}

function isPlan(v: unknown): v is EditPlan {
  return isRec(v) && Array.isArray(v.keeps) && Array.isArray(v.texts) && Array.isArray(v.inserts) && isRec(v.captions) && isRec(v.sound) && Array.isArray(v.summary);
}

/**
 * Ask the server for an edit plan of these takes. Takes with known words
 * skip transcription. Throws when the call fails or no plan comes back; a
 * plan built without the model arrives with fallbackReason set.
 */
export async function requestEditPlan(params: {
  assignmentId: string;
  doc: VideoDocument;
  takes: MediaAsset[];
  features: AutoFeatureInput[];
}): Promise<EditPlanReply> {
  const known = readAutoEdit(params.doc)?.words ?? {};
  const slots = takeSlots(params.doc);
  const stale = untouchedPlanOverlays(params.doc);
  const body = {
    assignment_id: params.assignmentId,
    takes: params.takes.map((t) => ({
      asset_id: t.id,
      storage_path: t.storagePath,
      duration_ms: t.durationMs ?? 0,
      ...(t.id in slots ? { slot: slots[t.id] } : {}),
      ...(known[t.id] ? { words: known[t.id].map(([w, s, e]) => ({ w, s, e })) } : {}),
    })),
    features: params.features.map(({ id, title, description, kind }) => ({ id, title, description, kind })),
    overlays: params.doc.overlays.flatMap((o) => (o.kind === 'text' && o.text.trim() && !stale.has(o.id) ? [{ id: o.id, text: o.text, start_ms: o.startMs, end_ms: o.endMs, y: o.y }] : [])),
  };
  const call = supabase.functions.invoke('auto-edit', { body });
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Auto edit took too long. Try again.')), CALL_TIMEOUT_MS));
  const { data, error } = await Promise.race([call, timeout]);
  if (error) throw new Error(await errorMessage(error));
  const raw = (data ?? {}) as Record<string, unknown>;
  if (typeof raw.error === 'string') throw new Error(raw.error);
  if (!isPlan(raw.plan)) throw new Error('Auto edit is not set up on the server yet. Deploy the auto-edit function.');
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const track = isRec(raw.sound_track) && typeof raw.sound_track.id === 'string' && typeof raw.sound_track.title === 'string' ? (raw.sound_track as unknown as AudioTrack) : null;
  return {
    takes: Array.isArray(raw.takes) ? (raw.takes as AutoEditReply['takes']) : [],
    plan: raw.plan,
    replaceOverlayIds: strings(raw.replace_overlay_ids),
    repairs: strings(raw.repairs),
    fallbackReason: typeof raw.fallback_reason === 'string' ? raw.fallback_reason : null,
    unheard: strings(raw.unheard),
    soundTrack: track,
    media: [
      ...params.features,
      ...(Array.isArray(raw.media_assets) ? raw.media_assets : []).flatMap((m): AutoFeatureInput[] =>
        isRec(m) && typeof m.id === 'string' && typeof m.path === 'string' && !params.features.some((f) => f.id === m.id)
          ? [{ id: m.id, title: typeof m.title === 'string' ? m.title : '', description: '', kind: m.kind === 'clip' ? 'clip' : 'still', path: m.path }]
          : [],
      ),
    ],
    runId: typeof raw.run_id === 'string' ? raw.run_id : null,
  };
}

/** Where plan text sits: inside the safe box, clear of the top bar, the buttons and the caption block. */
export const TEXT_ZONE_Y: Record<EditText['position'], number> = { top: 0.17, upper: 0.27, center: 0.45, lower: 0.62 };
/** Captions: low but above the bottom quarter, or just under the middle when text needs the lower zone. */
export const CAPTION_ZONE_Y: Record<EditPlan['captions']['position'], number> = { lower: 0.7, center: 0.56 };
const TEXT_LOOK: Record<EditText['role'], { size: number; bg: boolean }> = {
  hook: { size: 0.058, bg: true },
  header: { size: HEADER_SIZE, bg: true },
  label: { size: 0.044, bg: false },
  cta: { size: HEADER_SIZE, bg: true },
};
const TEXT_WIDTH = 0.8;
/** A floating insert sits below the face; a full one covers the frame width. */
const INSERT_PLACE = {
  overlay: { clip: { x: 0.5, y: 0.6, width: 0.42 }, still: { x: 0.5, y: 0.6, width: 0.6 } },
  full: { clip: { x: 0.5, y: 0.5, width: 0.92 }, still: { x: 0.5, y: 0.5, width: 0.92 } },
} as const;
const PRESERVED_MIN_MS = 1500;
const PLAN_SPEEDS = [1, 1.5, 2] as const;

export type EditPlanExtras = {
  /** Product media the plan may insert, with storage paths. */
  media?: AutoFeatureInput[];
  replaceOverlayIds?: string[];
  soundTrack?: AudioTrack | null;
  /** Words the server heard, per take. */
  words?: AutoEditReply['takes'];
  /** Takes the server could not listen to; not remembered as silent. */
  unheard?: string[];
  fallbackReason?: string | null;
  runId?: string | null;
};

function snapshot(doc: VideoDocument): EditSnapshot {
  return { assets: doc.assets, blocks: doc.blocks, overlays: doc.overlays, subtitles: doc.subtitles, audio: doc.audio ?? null };
}

/** Split the block under an output time in two, unless either half would be too short to show. */
function cutAt(blocks: Block[], ms: number): Block[] {
  let cursor = 0;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const dur = blockDurationMs(block);
    const offset = ms - cursor;
    if (offset > 0 && offset < dur) {
      const cell = block.cells[0];
      if (block.layout !== 'single' || offset < MIN_CLIP_MS || dur - offset < MIN_CLIP_MS) return blocks;
      const mid = cell.inMs + Math.round(offset * cell.speed);
      const head: Block = { id: newId('b'), layout: 'single', cells: [{ ...cell, id: newId('c'), outMs: mid }] };
      const tail: Block = { id: newId('b'), layout: 'single', cells: [{ ...cell, id: newId('c'), inMs: mid }] };
      return [...blocks.slice(0, i), head, tail, ...blocks.slice(i + 1)];
    }
    cursor += dur;
  }
  return blocks;
}

/** An output time on one timeline as the same source moment on another, or the nearest kept moment after (start) or before (end) it. */
function remapMs(from: VideoDocument, to: Block[], ms: number, edge: 'start' | 'end'): number | null {
  const ranges = blockRanges(from);
  const hit = ranges.find((r) => ms >= r.startMs && ms < r.endMs) ?? (edge === 'end' ? ranges[ranges.length - 1] : undefined);
  const cell = hit?.block.cells[0];
  if (!hit || !cell) return null;
  const src = cell.inMs + Math.min(ms - hit.startMs, hit.endMs - hit.startMs) * cell.speed;
  let cursor = 0;
  let before: number | null = null;
  let after: number | null = null;
  for (const block of to) {
    const dur = blockDurationMs(block);
    const c = block.cells[0];
    if (c.assetId === cell.assetId) {
      if (src >= c.inMs && src <= c.outMs) return Math.round(cursor + Math.min(dur, (src - c.inMs) / c.speed));
      if (c.inMs > src && (after === null || cursor < after)) after = cursor;
      if (c.outMs < src) before = cursor + dur;
    }
    cursor += dur;
  }
  return edge === 'start' ? (after ?? before) : (before ?? after);
}

/**
 * The edit plan as the studio document. Blocks are rebuilt from the kept
 * ranges (punch-ins as a static crop, speed per clip), a split insert becomes
 * a two cell block, other inserts and the texts become overlays, captions
 * and the brief's sound follow the plan. Overlays already on the video stay,
 * moved to the same spoken moment on the new timeline, unless the plan
 * replaces them. The takes, the plan, and the timeline before and after ride
 * in autoEdit, so the edit undoes in one step and the submission records what
 * changed afterwards. A plan with nothing usable leaves the document as it is.
 */
export function applyEditPlan(doc: VideoDocument, plan: EditPlan, takes: MediaAsset[], extras: EditPlanExtras = {}): VideoDocument {
  const takeById = new Map(takes.map((t) => [t.id, t]));
  let blocks: Block[] = [];
  for (const k of plan.keeps) {
    const take = takeById.get(k.asset_id);
    if (!take) continue;
    const max = take.durationMs ?? k.out_ms;
    const inMs = Math.max(0, Math.min(Math.round(k.in_ms), max));
    const outMs = Math.max(inMs, Math.min(Math.round(k.out_ms), max));
    const speed = PLAN_SPEEDS.find((s) => s === k.speed) ?? 1;
    if ((outMs - inMs) / speed < MIN_CLIP_MS) continue;
    const scale = Math.max(1, Math.min(1.3, Number.isFinite(k.zoom) ? k.zoom : 1));
    blocks.push({
      id: newId('b'),
      layout: 'single',
      cells: [{ id: newId('c'), assetId: take.id, inMs, outMs, speed, muted: false, crop: scale > 1 ? { scale, x: 0, y: 0 } : null }],
    });
  }
  blocks = blocks.slice(0, MAX_BLOCKS);
  if (blocks.length === 0) return doc;
  const total = blocks.reduce((sum, b) => sum + blockDurationMs(b), 0);
  const win = (start: number, end: number) => {
    const startMs = Math.max(0, Math.min(Math.round(start), total));
    return { startMs, endMs: Math.max(startMs, Math.min(Math.round(end), total)) };
  };

  // Product media: a split goes into the blocks, the rest float over them.
  const mediaById = new Map((extras.media ?? []).map((m) => [m.id, m]));
  const assets = new Map<string, MediaAsset>();
  for (const take of takes) if (blocks.some((b) => b.cells[0].assetId === take.id)) assets.set(take.id, take);
  const mediaOverlays: ImageOverlay[] = [];
  for (const m of plan.inserts) {
    const media = mediaById.get(m.media_id);
    if (!media) continue;
    const w = win(m.start_ms, m.end_ms);
    if (w.endMs - w.startMs < MIN_OVERLAY_MS) continue;
    const asset = featureAsset(media);
    let placed = false;
    // A split needs a picture, which can stay up for any length; a recording of unknown length could run out.
    if (m.layout === 'split' && media.kind === 'still') {
      const cut = cutAt(cutAt(blocks, w.startMs), w.endMs);
      if (cut.length <= MAX_BLOCKS) {
        let cursor = 0;
        blocks = cut.map((block) => {
          const dur = blockDurationMs(block);
          const mid = cursor + dur / 2;
          cursor += dur;
          if (block.layout !== 'single' || mid < w.startMs || mid >= w.endMs) return block;
          placed = true;
          const face = block.cells[0];
          const picture: Clip = { id: newId('c'), assetId: asset.id, inMs: 0, outMs: Math.max(MIN_CLIP_MS, Math.round((face.outMs - face.inMs) / face.speed)), speed: 1, muted: true, crop: null };
          return { ...block, layout: 'split_v' as const, cells: [face, picture] };
        });
      }
    }
    if (!placed) {
      const place = INSERT_PLACE[m.layout === 'full' ? 'full' : 'overlay'][media.kind];
      mediaOverlays.push({ kind: 'image', id: newId('o'), assetId: asset.id, ...place, ...w, enter: 'slide' });
    }
    assets.set(asset.id, asset);
  }

  // What was already on the video stays on the moment it was placed on.
  const prior = readAutoEdit(doc);
  const drop = new Set([...(extras.replaceOverlayIds ?? []), ...untouchedPlanOverlays(doc)]);
  const beforeTotal = documentDurationMs(doc);
  const kept: Overlay[] = [];
  for (const o of doc.overlays) {
    if (drop.has(o.id)) continue;
    const whole = o.startMs <= 0 && o.endMs >= beforeTotal;
    const startMs = whole ? 0 : remapMs(doc, blocks, o.startMs, 'start');
    const last = whole ? total : remapMs(doc, blocks, Math.max(o.startMs, o.endMs - 1), 'end');
    if (startMs === null || last === null) continue;
    let endMs = Math.min(total, whole ? last : last + 1);
    if (endMs - startMs < PRESERVED_MIN_MS) endMs = Math.min(total, startMs + Math.min(PRESERVED_MIN_MS, o.endMs - o.startMs));
    if (endMs - startMs < MIN_OVERLAY_MS) continue;
    kept.push({ ...o, startMs, endMs });
    if (o.kind === 'image') {
      const asset = doc.assets.find((a) => a.id === o.assetId);
      if (asset) assets.set(asset.id, asset);
    }
  }

  const texts: TextOverlay[] = [];
  for (const t of plan.texts) {
    const w = win(t.start_ms, t.end_ms);
    if (!t.text.trim() || w.endMs - w.startMs < MIN_OVERLAY_MS) continue;
    const look = TEXT_LOOK[t.role] ?? TEXT_LOOK.header;
    texts.push({
      kind: 'text',
      id: newId('o'),
      text: t.text.trim(),
      color: CLASSIC_TEXT_COLOR,
      bg: look.bg,
      size: look.size,
      x: 0.5,
      y: TEXT_ZONE_Y[t.position] ?? TEXT_ZONE_Y.upper,
      width: TEXT_WIDTH,
      ...w,
      enter: 'pop',
    });
  }

  // The brief's sound goes under the voice; a sound the creator picked themselves is left alone.
  let audio: PostAudio | null = doc.audio ?? null;
  const track = extras.soundTrack ?? null;
  if (plan.sound.use_brief_track && track && (!audio || audio.track.id === track.id)) {
    audio = { track: audio?.track ?? track, start: audio?.start ?? 0, vol: Math.max(0, Math.min(100, Math.round(plan.sound.track_volume))), voice: Math.max(0, Math.min(100, Math.round(plan.sound.voice_volume))) };
  }

  const { audio: _was, ...rest } = doc;
  const next: VideoDocument = pruneAssets({
    ...rest,
    version: EDIT_DOCUMENT_VERSION,
    assets: [...assets.values()],
    blocks,
    overlays: [...kept, ...texts, ...mediaOverlays].slice(0, MAX_OVERLAYS),
    subtitles: { enabled: plan.captions.enabled, y: CAPTION_ZONE_Y[plan.captions.position] ?? CAPTION_ZONE_Y.lower },
    ...(audio ? { audio } : {}),
  });

  const words: AutoEditState['words'] = { ...(prior?.words ?? {}) };
  const unheard = new Set(extras.unheard ?? []);
  for (const t of extras.words ?? []) if (!unheard.has(t.asset_id)) words[t.asset_id] = t.words.map((w) => [w.w, w.s, w.e]);
  return withState(next, {
    v: 1,
    takes,
    words,
    ranFor: takeKey(takes),
    cutMs: plan.cut_ms,
    ai: plan.ai,
    applied: {
      at: new Date().toISOString(),
      runId: extras.runId ?? null,
      plan,
      fallbackReason: extras.fallbackReason ?? null,
      before: snapshot(doc),
      result: snapshot(next),
    },
  });
}

/** The edit plan on this timeline, if one was applied and not undone. */
export function appliedEdit(doc: VideoDocument): AppliedEdit | null {
  return readAutoEdit(doc)?.applied ?? null;
}

/** Back to the timeline as it was before the edit plan. The words heard are kept. */
export function undoEditPlan(doc: VideoDocument): VideoDocument {
  const state = readAutoEdit(doc);
  const applied = state?.applied;
  if (!state || !applied) return doc;
  const { audio: _was, ...rest } = doc;
  const { before } = applied;
  const restored: VideoDocument = {
    ...rest,
    assets: before.assets,
    blocks: before.blocks,
    overlays: before.overlays,
    subtitles: before.subtitles,
    ...(before.audio ? { audio: before.audio } : {}),
  };
  return withState(restored, { v: 1, takes: state.takes, words: state.words, ranFor: null, cutMs: 0, ai: false, applied: null });
}

/**
 * What changed on the timeline since the edit plan was applied: the learning
 * signal a later job reads from submissions.edit_document. Null when no plan
 * is on the document.
 */
export function editPlanDelta(doc: VideoDocument): {
  ai: boolean;
  blocksChanged: boolean;
  textsRemoved: number;
  textsEdited: number;
  textsAdded: number;
  captionsChanged: boolean;
  soundChanged: boolean;
} | null {
  const applied = appliedEdit(doc);
  if (!applied) return null;
  const mix = (a: PostAudio | null) => (a ? `${a.track.id}/${a.start}/${a.vol}/${a.voice}` : '');
  const sig = (blocks: Block[]) => blocks.map((b) => `${b.layout}:${b.cells.map((c) => `${c.assetId}/${c.inMs}/${c.outMs}/${c.speed}/${c.crop?.scale ?? 1}`).join('+')}`).join('|');
  const was = new Map(applied.result.overlays.flatMap((o) => (o.kind === 'text' ? [[o.id, o] as const] : [])));
  const now = new Map(doc.overlays.flatMap((o) => (o.kind === 'text' ? [[o.id, o] as const] : [])));
  let removed = 0;
  let edited = 0;
  for (const [id, o] of was) {
    const cur = now.get(id);
    if (!cur) removed += 1;
    else if (cur.text !== o.text || cur.startMs !== o.startMs || cur.endMs !== o.endMs || cur.y !== o.y) edited += 1;
  }
  return {
    ai: applied.plan.ai,
    blocksChanged: sig(doc.blocks) !== sig(applied.result.blocks),
    textsRemoved: removed,
    textsEdited: edited,
    textsAdded: [...now.keys()].filter((id) => !was.has(id)).length,
    captionsChanged: doc.subtitles.enabled !== applied.result.subtitles.enabled || doc.subtitles.y !== applied.result.subtitles.y,
    soundChanged: mix(doc.audio ?? null) !== mix(applied.result.audio),
  };
}

/**
 * Tells the brain how the creator's final cut differs from the edit plan
 * (brain-signal stores it as a raw learning signal). Sent once the post has
 * gone out. Fire and forget: it never blocks or breaks a send, and a document
 * with no plan on it sends nothing.
 */
export function logEditPlanDelta(assignmentId: string, doc: VideoDocument): void {
  const delta = editPlanDelta(doc);
  if (!delta) return;
  void supabase.functions
    .invoke('brain-signal', { body: { signal: 'edit_plan', assignment_id: assignmentId, delta }, timeout: 20_000 })
    .then(({ error }) => {
      if (error) console.warn('edit plan signal not saved', error.message);
    })
    .catch(() => undefined);
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
