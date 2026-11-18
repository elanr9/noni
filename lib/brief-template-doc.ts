// A Guided template as a studio timeline and back. The campaign manager
// edits the template in the same reel editor creators use: each clip is one
// block of max(3, estimated seconds) with an empty dark frame (or its green
// screen picture), its on-screen text and pictures ride as overlays spanning
// the block. Saving walks the blocks in order and folds the overlays whose
// start falls inside each one back onto that clip; a block the editor made
// by splitting becomes a new template clip.
import {
  blockRanges,
  emptyVideoDocument,
  newId,
  type Block,
  type ImageOverlay,
  type MediaAsset,
  type Overlay,
  type TextOverlay,
  type VideoDocument,
} from './edit-document';
import {
  clipOverlays,
  clipSeconds,
  clipTexts,
  newClip,
  stText,
  type BriefClip,
  type BriefType,
  type GuidedState,
  type StOverlay,
  type StText,
} from './brief-library';

/** StText.size is px at a frame this wide; OverlayBox.size is a fraction of the frame width. */
const ST_FRAME_W = 300;
const MIN_CLIP_S = 3;
const PLACEHOLDER_S = 3;
/** Overlays that start a hair before a block still belong to it (rounding from drags). */
const EDGE_MS = 10;

/** Something <Image> can open; brand gradients ('grad:logo') and storage paths are not. */
function fileUri(src: string | null | undefined): string | null {
  if (!src) return null;
  return /^(file:|ph:|assets-library:|content:|https?:|data:)/.test(src) ? src : null;
}

function placeholderAsset(id: string, uri: string | null = null): MediaAsset {
  return { id, kind: 'image', localUri: uri, storagePath: null, durationMs: null, width: null, height: null };
}

function placeholderBlock(id: string, assetId: string, ms: number, inMs = 0): Block {
  return { id, layout: 'single', cells: [{ id: `cell-${id}`, assetId, inMs, outMs: inMs + ms, speed: 1, muted: true, crop: null }] };
}

function videoAsset(id: string, uri: string, durMs: number): MediaAsset {
  return { id, kind: 'video', localUri: uri, storagePath: null, durationMs: durMs, width: null, height: null };
}

export function toTextOverlay(t: StText, startMs: number, endMs: number): TextOverlay {
  return {
    kind: 'text',
    id: t.id,
    text: t.text,
    color: t.color,
    bg: t.style === 'bg' || t.style === 'inv-bg',
    size: t.size / ST_FRAME_W,
    x: t.x / 100,
    y: t.y / 100,
    width: t.w / 100,
    ...(t.spans.length ? { spans: t.spans.map((s) => ({ start: s.start, end: s.end, ...(s.color ? { color: s.color } : {}) })) } : {}),
    startMs,
    endMs,
  };
}

/** The template on the timeline: clips end to end, texts and pictures spanning their clip, captions off. */
export function templateToDoc(g: GuidedState, type: BriefType): VideoDocument {
  const base = emptyVideoDocument();
  const assets: MediaAsset[] = [];
  const blocks: Block[] = [];
  const overlays: Overlay[] = [];
  let at = 0;
  for (const c of g.clips) {
    let ms = Math.max(MIN_CLIP_S, clipSeconds(c, type)) * 1000;
    const gs = type === 'Greenscreen' && (g.fullGreen || c.green) ? (g.fullGreen ? g.gs : c.gs) : null;
    const uri = gs ? fileUri(gs.src) : null;
    const durMs = gs && gs.kind === 'video' ? Math.round(gs.dur * 1000) : 0;
    if (gs && gs.kind === 'video' && uri && durMs > 0) {
      // A video background plays behind the clip: one shared video runs on
      // across the clips while it lasts, a per-clip video starts at 0. A clip
      // never outlasts its video.
      const inMs = g.fullGreen && at + ms <= durMs ? at : 0;
      ms = Math.min(ms, durMs - inMs);
      const asset = videoAsset(`a-${c.id}`, uri, durMs);
      assets.push(asset);
      blocks.push(placeholderBlock(c.id, asset.id, ms, inMs));
    } else {
      const asset = placeholderAsset(`a-${c.id}`, gs && gs.kind === 'image' ? uri : null);
      assets.push(asset);
      blocks.push(placeholderBlock(c.id, asset.id, ms));
    }
    for (const t of clipTexts(c)) overlays.push(toTextOverlay(t, at, at + ms));
    for (const o of clipOverlays(c)) {
      const pic = placeholderAsset(`a-${o.id}`, fileUri(o.src));
      assets.push(pic);
      overlays.push({ kind: 'image', id: o.id, assetId: pic.id, x: o.x / 100, y: o.y / 100, width: o.w / 100, startMs: at, endMs: at + ms });
    }
    at += ms;
  }
  return { ...base, assets, blocks, overlays, subtitles: { ...base.subtitles, enabled: false } };
}

/** One more empty clip at the end of the timeline (the Add clip tile of the editor). */
export function appendPlaceholderClip(doc: VideoDocument): VideoDocument {
  const id = newId('b');
  const asset = placeholderAsset(`a-${id}`);
  return { ...doc, assets: [...doc.assets, asset], blocks: [...doc.blocks, placeholderBlock(id, asset.id, PLACEHOLDER_S * 1000)] };
}

function fromTextOverlay(o: TextOverlay, orig: StText | undefined): StText {
  const keep = orig ?? stText(o.text, { id: o.id });
  const style = o.bg ? (keep.style === 'inv-bg' ? 'inv-bg' : 'bg') : keep.style === 'bg' || keep.style === 'inv-bg' ? 'outline' : keep.style;
  return {
    ...keep,
    id: o.id,
    text: o.text,
    x: o.x * 100,
    y: o.y * 100,
    w: (o.width ?? keep.w / 100) * 100,
    size: Math.round(o.size * ST_FRAME_W),
    color: o.color,
    style,
    spans: o.spans ? o.spans.map((s) => ({ start: s.start, end: s.end, ...(s.color ? { color: s.color } : {}) })) : keep.spans,
  };
}

function fromImageOverlay(o: ImageOverlay, doc: VideoDocument, orig: StOverlay | undefined): StOverlay {
  const asset = doc.assets.find((a) => a.id === o.assetId);
  return {
    id: o.id,
    src: orig?.src ?? asset?.localUri ?? asset?.storagePath ?? '',
    label: orig?.label ?? 'Picture',
    x: o.x * 100,
    y: o.y * 100,
    w: o.width * 100,
  };
}

/** The saved timeline back onto the template, block by block in timeline order. */
export function docToTemplate(doc: VideoDocument, g: GuidedState, scripts: Record<string, string>): BriefClip[] {
  const origTexts = new Map<string, StText>();
  const origPics = new Map<string, StOverlay>();
  for (const c of g.clips) {
    for (const t of clipTexts(c)) origTexts.set(t.id, t);
    for (const o of clipOverlays(c)) origPics.set(o.id, o);
  }
  return blockRanges(doc).map(({ block, startMs, endMs }) => {
    const prev = g.clips.find((c) => c.id === block.id) ?? newClip('', { id: block.id });
    const inside = (o: Overlay) => o.startMs >= startMs - EDGE_MS && o.startMs < endMs;
    const texts = doc.overlays.filter((o): o is TextOverlay => o.kind === 'text' && inside(o)).map((o) => fromTextOverlay(o, origTexts.get(o.id)));
    const overlays = doc.overlays.filter((o): o is ImageOverlay => o.kind === 'image' && inside(o)).map((o) => fromImageOverlay(o, doc, origPics.get(o.id)));
    const text = scripts[block.id] ?? prev.text;
    return { ...prev, text, doc: { texts, overlays }, onScreen: texts.map((t) => t.text).join(' · ') };
  });
}
