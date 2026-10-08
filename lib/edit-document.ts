// The edit document: one JSON object that describes a creator's post from
// source media to final frame. The studio edits it, the on device preview
// plays it, and render-submission turns it into the final video or slides.
// Every time in this file is milliseconds. Positions and sizes are fractions
// of the frame so the same document means the same thing on any device and
// in the 1080x1920 render. Mirrored on the server in
// supabase/functions/_shared/editDocument.ts; change both together.
import type { OverlayBox } from './overlay-boxes';
import type { Json } from './types';
import type { EditCrop, EditSpeed } from './video-edit';
import { EDIT_SPEEDS, MAX_CROP_SCALE } from './video-edit';

export const EDIT_DOCUMENT_VERSION = 1;

export type AssetKind = 'video' | 'image';

/** A source file. localUri is the file on the authoring phone; storagePath
 * is where it lives in the videos bucket once the upload queue is done.
 * The render only ever reads storagePath. */
export type MediaAsset = {
  id: string;
  kind: AssetKind;
  localUri: string | null;
  storagePath: string | null;
  /** Null for images. */
  durationMs: number | null;
  width: number | null;
  height: number | null;
};

/** A source range played inside one cell of a block. For an image asset
 * inMs is 0 and outMs is how long the picture stays up. */
export type Clip = {
  id: string;
  assetId: string;
  inMs: number;
  outMs: number;
  speed: EditSpeed;
  muted: boolean;
  crop: EditCrop | null;
};

/** single: one cell filling the frame. split_v: cell 0 on top, cell 1 on
 * the bottom. split_h: cell 0 on the left, cell 1 on the right. */
export type BlockLayout = 'single' | 'split_v' | 'split_h';

export const BLOCK_CELL_COUNT: Record<BlockLayout, 1 | 2> = {
  single: 1,
  split_v: 2,
  split_h: 2,
};

/** One stretch of the timeline. Its duration is the shortest cell, so a
 * split never shows a frozen or black half. */
export type Block = {
  id: string;
  layout: BlockLayout;
  cells: Clip[];
};

export type OverlayEnter = 'pop' | 'slide';

/** On screen text the creator placed, visible from startMs to endMs on the
 * output timeline. Styling fields match OverlayBox so the existing text
 * metrics, bubble path and render pass apply unchanged. */
export type TextOverlay = OverlayBox & {
  kind: 'text';
  startMs: number;
  endMs: number;
  enter?: OverlayEnter;
};

/** A picture popped over the video: a screenshot, a photo, a brand asset. */
export type ImageOverlay = {
  kind: 'image';
  id: string;
  assetId: string;
  x: number;
  y: number;
  width: number;
  startMs: number;
  endMs: number;
  enter?: OverlayEnter;
};

export type Overlay = TextOverlay | ImageOverlay;

export type SubtitleSettings = { enabled: boolean; y: number };

export type VideoDocument = {
  version: typeof EDIT_DOCUMENT_VERSION;
  format: 'video';
  aspect: '9:16';
  assets: MediaAsset[];
  blocks: Block[];
  overlays: Overlay[];
  /** Post level multiplier applied after loudness normalization. */
  gain: number;
  subtitles: SubtitleSettings;
};

export type SlideAspect = '9:16' | '4:5' | '1:1';

/** Source rectangle in source pixels; same shape as slides/photo-crop. */
export type SlideCrop = { x: number; y: number; width: number; height: number };

export type Slide = {
  id: string;
  assetId: string;
  crop: SlideCrop | null;
  /** 4:5 crop for the Instagram copy of a 9:16 slideshow. */
  instagramCrop: SlideCrop | null;
  boxes: OverlayBox[];
};

export type SlideshowDocument = {
  version: typeof EDIT_DOCUMENT_VERSION;
  format: 'slideshow';
  aspect: SlideAspect;
  assets: MediaAsset[];
  slides: Slide[];
};

export type EditDocument = VideoDocument | SlideshowDocument;

export const MIN_CLIP_MS = 300;
export const MAX_OVERLAYS = 40;
export const MAX_SLIDES = 20;
export const MAX_BLOCKS = 60;
export const MIN_OVERLAY_MS = 200;
export const DEFAULT_IMAGE_CLIP_MS = 3000;
export const DEFAULT_OVERLAY_MS = 3000;
export const DEFAULT_SUBTITLE_Y = 0.78;
export const DEFAULT_GAIN = 2;

let nextId = 0;
export function newId(prefix: string): string {
  nextId += 1;
  return `${prefix}${Date.now().toString(36)}${nextId.toString(36)}`;
}

export function emptyVideoDocument(): VideoDocument {
  return {
    version: EDIT_DOCUMENT_VERSION,
    format: 'video',
    aspect: '9:16',
    assets: [],
    blocks: [],
    overlays: [],
    gain: DEFAULT_GAIN,
    subtitles: { enabled: true, y: DEFAULT_SUBTITLE_Y },
  };
}

export function emptySlideshowDocument(aspect: SlideAspect = '9:16'): SlideshowDocument {
  return { version: EDIT_DOCUMENT_VERSION, format: 'slideshow', aspect, assets: [], slides: [] };
}

// ---------------------------------------------------------------------------
// Durations and lookup

export function clipDurationMs(clip: Clip): number {
  return Math.max(0, Math.round((clip.outMs - clip.inMs) / clip.speed));
}

export function blockDurationMs(block: Block): number {
  if (block.cells.length === 0) return 0;
  return Math.min(...block.cells.map(clipDurationMs));
}

export function documentDurationMs(doc: VideoDocument): number {
  return doc.blocks.reduce((sum, block) => sum + blockDurationMs(block), 0);
}

export type BlockRange = { block: Block; startMs: number; endMs: number };

export function blockRanges(doc: VideoDocument): BlockRange[] {
  let cursor = 0;
  return doc.blocks.map((block) => {
    const startMs = cursor;
    cursor += blockDurationMs(block);
    return { block, startMs, endMs: cursor };
  });
}

/** The block under an output time; the last block at the very end. */
export function blockAt(doc: VideoDocument, positionMs: number): BlockRange | null {
  const ranges = blockRanges(doc);
  if (ranges.length === 0) return null;
  const hit = ranges.find((r) => positionMs >= r.startMs && positionMs < r.endMs);
  return hit ?? ranges[ranges.length - 1];
}

export function assetById(doc: EditDocument, assetId: string): MediaAsset | null {
  return doc.assets.find((a) => a.id === assetId) ?? null;
}

/** Output time -> source time inside a clip, honoring speed. */
export function outputToSourceMs(clip: Clip, offsetMs: number): number {
  return clip.inMs + Math.round(offsetMs * clip.speed);
}

/** Assets referenced by at least one block, overlay or slide. */
export function referencedAssetIds(doc: EditDocument): Set<string> {
  const ids = new Set<string>();
  if (doc.format === 'video') {
    for (const block of doc.blocks) for (const cell of block.cells) ids.add(cell.assetId);
    for (const overlay of doc.overlays) if (overlay.kind === 'image') ids.add(overlay.assetId);
  } else {
    for (const slide of doc.slides) ids.add(slide.assetId);
  }
  return ids;
}

/** True once every referenced asset has a storage path, so the render can run. */
export function allAssetsUploaded(doc: EditDocument): boolean {
  const referenced = referencedAssetIds(doc);
  return doc.assets.every((a) => !referenced.has(a.id) || a.storagePath !== null);
}

// ---------------------------------------------------------------------------
// Assets

export function addAsset(doc: VideoDocument, asset: MediaAsset): VideoDocument;
export function addAsset(doc: SlideshowDocument, asset: MediaAsset): SlideshowDocument;
export function addAsset(doc: EditDocument, asset: MediaAsset): EditDocument {
  if (doc.assets.some((a) => a.id === asset.id)) return doc;
  return { ...doc, assets: [...doc.assets, asset] };
}

export function updateAsset(doc: VideoDocument, assetId: string, patch: Partial<Omit<MediaAsset, 'id'>>): VideoDocument;
export function updateAsset(doc: SlideshowDocument, assetId: string, patch: Partial<Omit<MediaAsset, 'id'>>): SlideshowDocument;
export function updateAsset(doc: EditDocument, assetId: string, patch: Partial<Omit<MediaAsset, 'id'>>): EditDocument {
  return {
    ...doc,
    assets: doc.assets.map((a) => (a.id === assetId ? { ...a, ...patch } : a)),
  };
}

/** Drop assets nothing points at any more. */
export function pruneAssets(doc: VideoDocument): VideoDocument;
export function pruneAssets(doc: SlideshowDocument): SlideshowDocument;
export function pruneAssets(doc: EditDocument): EditDocument {
  const referenced = referencedAssetIds(doc);
  const assets = doc.assets.filter((a) => referenced.has(a.id));
  return assets.length === doc.assets.length ? doc : { ...doc, assets };
}

// ---------------------------------------------------------------------------
// Clips and blocks

export function clipForAsset(asset: MediaAsset): Clip {
  return {
    id: newId('c'),
    assetId: asset.id,
    inMs: 0,
    outMs: asset.kind === 'video' ? (asset.durationMs ?? 0) : DEFAULT_IMAGE_CLIP_MS,
    speed: 1,
    muted: asset.kind === 'image',
    crop: null,
  };
}

export function singleBlock(clip: Clip): Block {
  return { id: newId('b'), layout: 'single', cells: [clip] };
}

/** Append a recorded or imported asset as its own block at the end. */
export function appendAssetBlock(doc: VideoDocument, asset: MediaAsset): VideoDocument {
  const withAsset = addAsset(doc, asset);
  return { ...withAsset, blocks: [...withAsset.blocks, singleBlock(clipForAsset(asset))] };
}

export function insertBlock(doc: VideoDocument, block: Block, index: number): VideoDocument {
  const at = Math.max(0, Math.min(doc.blocks.length, index));
  const blocks = [...doc.blocks];
  blocks.splice(at, 0, block);
  return { ...doc, blocks };
}

export function deleteBlock(doc: VideoDocument, blockId: string): VideoDocument {
  const blocks = doc.blocks.filter((b) => b.id !== blockId);
  if (blocks.length === doc.blocks.length) return doc;
  return pruneAssets(shiftOverlaysAfterBlockChange({ ...doc, blocks }));
}

export function moveBlock(doc: VideoDocument, blockId: string, toIndex: number): VideoDocument {
  const from = doc.blocks.findIndex((b) => b.id === blockId);
  if (from < 0) return doc;
  const to = Math.max(0, Math.min(doc.blocks.length - 1, toIndex));
  if (from === to) return doc;
  const blocks = [...doc.blocks];
  const [block] = blocks.splice(from, 1);
  blocks.splice(to, 0, block);
  return { ...doc, blocks };
}

export function duplicateBlock(doc: VideoDocument, blockId: string): VideoDocument {
  const index = doc.blocks.findIndex((b) => b.id === blockId);
  if (index < 0 || doc.blocks.length >= MAX_BLOCKS) return doc;
  const source = doc.blocks[index];
  const copy: Block = {
    id: newId('b'),
    layout: source.layout,
    cells: source.cells.map((c) => ({ ...c, id: newId('c'), crop: c.crop ? { ...c.crop } : null })),
  };
  return insertBlock(doc, copy, index + 1);
}

export function updateCell(
  doc: VideoDocument,
  blockId: string,
  cellIndex: number,
  patch: Partial<Omit<Clip, 'id' | 'assetId'>>,
): VideoDocument {
  return {
    ...doc,
    blocks: doc.blocks.map((b) => {
      if (b.id !== blockId) return b;
      return {
        ...b,
        cells: b.cells.map((c, i) => (i === cellIndex ? clampClip({ ...c, ...patch }, assetById(doc, c.assetId)) : c)),
      };
    }),
  };
}

export function clampClip(clip: Clip, asset: MediaAsset | null): Clip {
  const sourceMax = asset?.kind === 'video' ? (asset.durationMs ?? clip.outMs) : Number.POSITIVE_INFINITY;
  const minSpan = MIN_CLIP_MS * clip.speed;
  let inMs = Math.max(0, Math.min(clip.inMs, sourceMax - minSpan));
  let outMs = Math.min(sourceMax, Math.max(clip.outMs, inMs + minSpan));
  if (outMs - inMs < minSpan) {
    inMs = Math.max(0, outMs - minSpan);
    outMs = Math.min(sourceMax, inMs + minSpan);
  }
  const crop = clip.crop
    ? {
        scale: Math.max(1, Math.min(MAX_CROP_SCALE, clip.crop.scale)),
        x: Math.max(-1, Math.min(1, clip.crop.x)),
        y: Math.max(-1, Math.min(1, clip.crop.y)),
      }
    : null;
  return { ...clip, inMs: Math.round(inMs), outMs: Math.round(outMs), crop };
}

/** Change a block's layout. Growing to a split needs a second asset; the
 * new cell starts at the asset's full range. Shrinking keeps cell 0. */
export function setBlockLayout(
  doc: VideoDocument,
  blockId: string,
  layout: BlockLayout,
  secondAsset: MediaAsset | null,
): VideoDocument {
  let next = doc;
  const blocks = doc.blocks.map((b) => {
    if (b.id !== blockId) return b;
    const wanted = BLOCK_CELL_COUNT[layout];
    let cells = b.cells.slice(0, wanted);
    if (cells.length < wanted) {
      if (!secondAsset) return b;
      next = addAsset(next, secondAsset);
      cells = [...cells, clipForAsset(secondAsset)];
    }
    return { ...b, layout, cells };
  });
  return pruneAssets({ ...next, blocks });
}

/** Swap which cell is on top or on the left. */
export function swapCells(doc: VideoDocument, blockId: string): VideoDocument {
  return {
    ...doc,
    blocks: doc.blocks.map((b) =>
      b.id === blockId && b.cells.length === 2 ? { ...b, cells: [b.cells[1], b.cells[0]] } : b,
    ),
  };
}

/** Replace the media in one cell; the new clip starts at its full range. */
export function replaceCellAsset(
  doc: VideoDocument,
  blockId: string,
  cellIndex: number,
  asset: MediaAsset,
): VideoDocument {
  const withAsset = addAsset(doc, asset);
  const blocks = withAsset.blocks.map((b) =>
    b.id === blockId
      ? { ...b, cells: b.cells.map((c, i) => (i === cellIndex ? clipForAsset(asset) : c)) }
      : b,
  );
  return pruneAssets({ ...withAsset, blocks });
}

/** Cut the block under positionMs into two blocks; every cell splits at
 * the same output offset so splits stay in sync. No-op within MIN_CLIP_MS
 * of either edge. */
export function splitBlockAt(doc: VideoDocument, positionMs: number): VideoDocument {
  const hit = blockAt(doc, positionMs);
  if (!hit) return doc;
  const offset = positionMs - hit.startMs;
  const duration = blockDurationMs(hit.block);
  if (offset < MIN_CLIP_MS || duration - offset < MIN_CLIP_MS) return doc;
  const head: Block = {
    id: hit.block.id,
    layout: hit.block.layout,
    cells: hit.block.cells.map((c) => ({ ...c, outMs: outputToSourceMs(c, offset) })),
  };
  const tail: Block = {
    id: newId('b'),
    layout: hit.block.layout,
    cells: hit.block.cells.map((c) => ({
      ...c,
      id: newId('c'),
      inMs: outputToSourceMs(c, offset),
      crop: c.crop ? { ...c.crop } : null,
    })),
  };
  const index = doc.blocks.findIndex((b) => b.id === hit.block.id);
  const blocks = [...doc.blocks];
  blocks.splice(index, 1, head, tail);
  return { ...doc, blocks };
}

export function setCellSpeed(doc: VideoDocument, blockId: string, cellIndex: number, speed: EditSpeed): VideoDocument {
  return shiftOverlaysAfterBlockChange(updateCell(doc, blockId, cellIndex, { speed }));
}

/** Trim a cell's in or out point by an output-time delta. */
export function trimCell(
  doc: VideoDocument,
  blockId: string,
  cellIndex: number,
  edge: 'in' | 'out',
  deltaMs: number,
): VideoDocument {
  const block = doc.blocks.find((b) => b.id === blockId);
  const cell = block?.cells[cellIndex];
  if (!block || !cell) return doc;
  const sourceDelta = Math.round(deltaMs * cell.speed);
  const patch = edge === 'in' ? { inMs: cell.inMs + sourceDelta } : { outMs: cell.outMs + sourceDelta };
  return shiftOverlaysAfterBlockChange(updateCell(doc, blockId, cellIndex, patch));
}

/** Overlays past the end of a shortened timeline are pulled back so none
 * of them fall off the video. */
function shiftOverlaysAfterBlockChange(doc: VideoDocument): VideoDocument {
  const total = documentDurationMs(doc);
  if (total === 0) return { ...doc, overlays: [] };
  const overlays = doc.overlays.map((o) => clampOverlayTimes(o, total));
  return { ...doc, overlays };
}

// ---------------------------------------------------------------------------
// Overlays

export function clampOverlayTimes<T extends Overlay>(overlay: T, totalMs: number): T {
  let startMs = Math.max(0, Math.min(overlay.startMs, totalMs - MIN_OVERLAY_MS));
  let endMs = Math.min(totalMs, Math.max(overlay.endMs, startMs + MIN_OVERLAY_MS));
  if (endMs - startMs < MIN_OVERLAY_MS) {
    startMs = Math.max(0, endMs - MIN_OVERLAY_MS);
    endMs = Math.min(totalMs, startMs + MIN_OVERLAY_MS);
  }
  return { ...overlay, startMs: Math.round(startMs), endMs: Math.round(endMs) };
}

export function addOverlay(doc: VideoDocument, overlay: Overlay): VideoDocument {
  if (doc.overlays.length >= MAX_OVERLAYS) return doc;
  const total = documentDurationMs(doc);
  return { ...doc, overlays: [...doc.overlays, clampOverlayTimes(overlay, total)] };
}

export function updateOverlay(doc: VideoDocument, overlayId: string, patch: Partial<TextOverlay> | Partial<ImageOverlay>): VideoDocument {
  const total = documentDurationMs(doc);
  return {
    ...doc,
    overlays: doc.overlays.map((o) => {
      if (o.id !== overlayId) return o;
      const merged = { ...o, ...patch } as Overlay;
      return clampOverlayTimes(merged, total);
    }),
  };
}

export function removeOverlay(doc: VideoDocument, overlayId: string): VideoDocument {
  const overlays = doc.overlays.filter((o) => o.id !== overlayId);
  return overlays.length === doc.overlays.length ? doc : pruneAssets({ ...doc, overlays });
}

export function overlaysAt(doc: VideoDocument, positionMs: number): Overlay[] {
  return doc.overlays.filter((o) => positionMs >= o.startMs && positionMs < o.endMs);
}

export function defaultOverlayWindow(doc: VideoDocument, positionMs: number): { startMs: number; endMs: number } {
  const total = documentDurationMs(doc);
  const startMs = Math.max(0, Math.min(positionMs, total - MIN_OVERLAY_MS));
  return { startMs, endMs: Math.min(total, startMs + DEFAULT_OVERLAY_MS) };
}

// ---------------------------------------------------------------------------
// Slides

export function appendSlide(doc: SlideshowDocument, asset: MediaAsset, crop: SlideCrop | null): SlideshowDocument {
  if (doc.slides.length >= MAX_SLIDES) return doc;
  const withAsset = addAsset(doc, asset);
  const slide: Slide = { id: newId('s'), assetId: asset.id, crop, instagramCrop: null, boxes: [] };
  return { ...withAsset, slides: [...withAsset.slides, slide] };
}

export function updateSlide(doc: SlideshowDocument, slideId: string, patch: Partial<Omit<Slide, 'id'>>): SlideshowDocument {
  return { ...doc, slides: doc.slides.map((s) => (s.id === slideId ? { ...s, ...patch } : s)) };
}

export function removeSlide(doc: SlideshowDocument, slideId: string): SlideshowDocument {
  const slides = doc.slides.filter((s) => s.id !== slideId);
  return slides.length === doc.slides.length ? doc : pruneAssets({ ...doc, slides });
}

export function moveSlide(doc: SlideshowDocument, slideId: string, toIndex: number): SlideshowDocument {
  const from = doc.slides.findIndex((s) => s.id === slideId);
  if (from < 0) return doc;
  const to = Math.max(0, Math.min(doc.slides.length - 1, toIndex));
  if (from === to) return doc;
  const slides = [...doc.slides];
  const [slide] = slides.splice(from, 1);
  slides.splice(to, 0, slide);
  return { ...doc, slides };
}

// ---------------------------------------------------------------------------
// Serialization. The stored shape is the TypeScript shape; parse validates
// every field so a bad row can never crash the studio or the render.

type Rec = Record<string, unknown>;

function isRec(value: unknown): value is Rec {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function optNum(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function parseAsset(raw: unknown): MediaAsset | null {
  if (!isRec(raw)) return null;
  const id = str(raw.id);
  const kind = raw.kind === 'video' || raw.kind === 'image' ? raw.kind : null;
  if (!id || !kind) return null;
  return {
    id,
    kind,
    localUri: str(raw.localUri),
    storagePath: str(raw.storagePath),
    durationMs: optNum(raw.durationMs),
    width: optNum(raw.width),
    height: optNum(raw.height),
  };
}

function parseCrop(raw: unknown): EditCrop | null {
  if (!isRec(raw)) return null;
  return { scale: num(raw.scale, 1), x: num(raw.x, 0), y: num(raw.y, 0) };
}

function parseSpeed(raw: unknown): EditSpeed {
  return EDIT_SPEEDS.find((s) => s === raw) ?? 1;
}

function parseClip(raw: unknown, assets: Map<string, MediaAsset>): Clip | null {
  if (!isRec(raw)) return null;
  const id = str(raw.id);
  const assetId = str(raw.assetId);
  if (!id || !assetId || !assets.has(assetId)) return null;
  const clip: Clip = {
    id,
    assetId,
    inMs: num(raw.inMs, 0),
    outMs: num(raw.outMs, 0),
    speed: parseSpeed(raw.speed),
    muted: bool(raw.muted, false),
    crop: parseCrop(raw.crop),
  };
  return clampClip(clip, assets.get(assetId) ?? null);
}

function parseLayout(raw: unknown): BlockLayout {
  return raw === 'split_v' || raw === 'split_h' ? raw : 'single';
}

function parseBlock(raw: unknown, assets: Map<string, MediaAsset>): Block | null {
  if (!isRec(raw) || !Array.isArray(raw.cells)) return null;
  const id = str(raw.id);
  if (!id) return null;
  const layout = parseLayout(raw.layout);
  const cells = raw.cells.map((c) => parseClip(c, assets)).filter((c): c is Clip => c !== null);
  if (cells.length < BLOCK_CELL_COUNT[layout]) {
    if (cells.length === 0) return null;
    return { id, layout: 'single', cells: [cells[0]] };
  }
  return { id, layout, cells: cells.slice(0, BLOCK_CELL_COUNT[layout]) };
}

function parseEnter(raw: unknown): OverlayEnter | undefined {
  return raw === 'pop' || raw === 'slide' ? raw : undefined;
}

function parseBox(raw: unknown): OverlayBox | null {
  if (!isRec(raw)) return null;
  const id = str(raw.id);
  const text = str(raw.text);
  const color = str(raw.color);
  if (!id || text === null || !color || !/^#[0-9A-Fa-f]{6}$/.test(color)) return null;
  const width = optNum(raw.width);
  return {
    id,
    text,
    color: color.toUpperCase(),
    bg: bool(raw.bg, false),
    size: num(raw.size, 0.05),
    x: num(raw.x, 0.5),
    y: num(raw.y, 0.3),
    ...(width !== null ? { width } : {}),
  };
}

function parseOverlay(raw: unknown, assets: Map<string, MediaAsset>): Overlay | null {
  if (!isRec(raw)) return null;
  const startMs = num(raw.startMs, 0);
  const endMs = num(raw.endMs, startMs + DEFAULT_OVERLAY_MS);
  const enter = parseEnter(raw.enter);
  if (raw.kind === 'image') {
    const id = str(raw.id);
    const assetId = str(raw.assetId);
    if (!id || !assetId || !assets.has(assetId)) return null;
    return {
      kind: 'image',
      id,
      assetId,
      x: num(raw.x, 0.5),
      y: num(raw.y, 0.5),
      width: num(raw.width, 0.4),
      startMs,
      endMs,
      ...(enter ? { enter } : {}),
    };
  }
  const box = parseBox(raw);
  if (!box) return null;
  return { ...box, kind: 'text', startMs, endMs, ...(enter ? { enter } : {}) };
}

function parseSlideCrop(raw: unknown): SlideCrop | null {
  if (!isRec(raw)) return null;
  return { x: num(raw.x, 0), y: num(raw.y, 0), width: num(raw.width, 0), height: num(raw.height, 0) };
}

function parseSlide(raw: unknown, assets: Map<string, MediaAsset>): Slide | null {
  if (!isRec(raw)) return null;
  const id = str(raw.id);
  const assetId = str(raw.assetId);
  if (!id || !assetId || !assets.has(assetId)) return null;
  const boxes = Array.isArray(raw.boxes)
    ? raw.boxes.map(parseBox).filter((b): b is OverlayBox => b !== null)
    : [];
  return { id, assetId, crop: parseSlideCrop(raw.crop), instagramCrop: parseSlideCrop(raw.instagramCrop), boxes };
}

function parseSlideAspect(raw: unknown): SlideAspect {
  return raw === '4:5' || raw === '1:1' ? raw : '9:16';
}

/** Null when the value is not an edit document at all. */
export function parseEditDocument(value: Json | null | undefined): EditDocument | null {
  if (!isRec(value)) return null;
  const assetList = Array.isArray(value.assets)
    ? value.assets.map(parseAsset).filter((a): a is MediaAsset => a !== null)
    : [];
  const assets = new Map(assetList.map((a) => [a.id, a]));

  if (value.format === 'slideshow') {
    const slides = Array.isArray(value.slides)
      ? value.slides.map((s) => parseSlide(s, assets)).filter((s): s is Slide => s !== null)
      : [];
    return pruneAssets({
      version: EDIT_DOCUMENT_VERSION,
      format: 'slideshow',
      aspect: parseSlideAspect(value.aspect),
      assets: assetList,
      slides: slides.slice(0, MAX_SLIDES),
    });
  }
  if (value.format !== 'video') return null;

  const blocks = Array.isArray(value.blocks)
    ? value.blocks.map((b) => parseBlock(b, assets)).filter((b): b is Block => b !== null)
    : [];
  const doc: VideoDocument = {
    version: EDIT_DOCUMENT_VERSION,
    format: 'video',
    aspect: '9:16',
    assets: assetList,
    blocks: blocks.slice(0, MAX_BLOCKS),
    overlays: [],
    gain: Math.max(0.5, Math.min(3, num(value.gain, DEFAULT_GAIN))),
    subtitles: isRec(value.subtitles)
      ? { enabled: bool(value.subtitles.enabled, true), y: num(value.subtitles.y, DEFAULT_SUBTITLE_Y) }
      : { enabled: true, y: DEFAULT_SUBTITLE_Y },
  };
  const total = documentDurationMs(doc);
  const overlays = Array.isArray(value.overlays)
    ? value.overlays.map((o) => parseOverlay(o, assets)).filter((o): o is Overlay => o !== null)
    : [];
  doc.overlays = total > 0 ? overlays.slice(0, MAX_OVERLAYS).map((o) => clampOverlayTimes(o, total)) : [];
  return pruneAssets(doc);
}

/** The document is already plain JSON; this only fixes the type. */
export function serializeEditDocument(doc: EditDocument): Json {
  return JSON.parse(JSON.stringify(doc)) as Json;
}
