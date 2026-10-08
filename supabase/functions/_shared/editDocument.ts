// Server mirror of lib/edit-document.ts: the types and the validating parser
// for the edit document frozen onto submissions.edit_document. Only what the
// render needs is mirrored (types, durations, lookup, parse). Change both
// files together.

export const EDIT_DOCUMENT_VERSION = 1;

export const EDIT_SPEEDS = [0.5, 1, 1.5, 2, 3] as const;
export type EditSpeed = (typeof EDIT_SPEEDS)[number];
export const MAX_CROP_SCALE = 3;

/** Zoom about the frame centre (scale >= 1) plus a pan as a fraction of the frame. */
export type EditCrop = { scale: number; x: number; y: number };

/** Mirror of lib/overlay-boxes.ts OverlayBox. */
export type OverlayBox = {
  id: string;
  text: string;
  color: string;
  bg: boolean;
  size: number;
  x: number;
  y: number;
  width?: number;
};

export type AssetKind = 'video' | 'image';

export type MediaAsset = {
  id: string;
  kind: AssetKind;
  localUri: string | null;
  storagePath: string | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
};

export type Clip = {
  id: string;
  assetId: string;
  inMs: number;
  outMs: number;
  speed: EditSpeed;
  muted: boolean;
  crop: EditCrop | null;
};

export type BlockLayout = 'single' | 'split_v' | 'split_h';

export const BLOCK_CELL_COUNT: Record<BlockLayout, 1 | 2> = {
  single: 1,
  split_v: 2,
  split_h: 2,
};

export type Block = {
  id: string;
  layout: BlockLayout;
  cells: Clip[];
};

export type OverlayEnter = 'pop' | 'slide';

export type TextOverlay = OverlayBox & {
  kind: 'text';
  startMs: number;
  endMs: number;
  enter?: OverlayEnter;
};

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
  gain: number;
  subtitles: SubtitleSettings;
};

export type SlideAspect = '9:16' | '4:5' | '1:1';

export type SlideCrop = { x: number; y: number; width: number; height: number };

export type Slide = {
  id: string;
  assetId: string;
  crop: SlideCrop | null;
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
export const DEFAULT_OVERLAY_MS = 3000;
export const DEFAULT_SUBTITLE_Y = 0.78;
export const DEFAULT_GAIN = 2;

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

export function assetById(doc: EditDocument, assetId: string): MediaAsset | null {
  return doc.assets.find((a) => a.id === assetId) ?? null;
}

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

function pruneAssets<T extends EditDocument>(doc: T): T {
  const referenced = referencedAssetIds(doc);
  const assets = doc.assets.filter((a) => referenced.has(a.id));
  return assets.length === doc.assets.length ? doc : { ...doc, assets };
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

export function clampOverlayTimes<T extends Overlay>(overlay: T, totalMs: number): T {
  let startMs = Math.max(0, Math.min(overlay.startMs, totalMs - MIN_OVERLAY_MS));
  let endMs = Math.min(totalMs, Math.max(overlay.endMs, startMs + MIN_OVERLAY_MS));
  if (endMs - startMs < MIN_OVERLAY_MS) {
    startMs = Math.max(0, endMs - MIN_OVERLAY_MS);
    endMs = Math.min(totalMs, startMs + MIN_OVERLAY_MS);
  }
  return { ...overlay, startMs: Math.round(startMs), endMs: Math.round(endMs) };
}

// ---------------------------------------------------------------------------
// Parsing. Same clamps as the client so both sides agree on the document.

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
export function parseEditDocument(value: unknown): EditDocument | null {
  if (!isRec(value)) return null;
  const assetList = Array.isArray(value.assets)
    ? value.assets.map(parseAsset).filter((a): a is MediaAsset => a !== null)
    : [];
  const assets = new Map(assetList.map((a) => [a.id, a]));

  if (value.format === 'slideshow') {
    const slides = Array.isArray(value.slides)
      ? value.slides.map((s) => parseSlide(s, assets)).filter((s): s is Slide => s !== null)
      : [];
    return pruneAssets<SlideshowDocument>({
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
  return pruneAssets<VideoDocument>(doc);
}
