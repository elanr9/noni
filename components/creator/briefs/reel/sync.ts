// Plan to document. The studio VideoDocument holds the clips, their trims
// and the overlays; the plan says which block belongs to which point. Text
// overlays are keyed `pt-<item id>` and the plug's feature screenshot
// `pi-<item id>`, so re-syncing never duplicates.
import {
  addAsset,
  addOverlay,
  assetById,
  blockRanges,
  clampOverlayTimes,
  clipForAsset,
  deleteBlock,
  documentDurationMs,
  insertBlock,
  MIN_CLIP_MS,
  removeOverlay,
  singleBlock,
  updateCell,
  updateOverlay,
  type ImageOverlay,
  type MediaAsset,
  type Overlay,
  type TextOverlay,
  type VideoDocument,
} from '../../../../lib/edit-document';
import { isVideoEditorAvailable, speechBounds } from '../../../../modules/video-editor';
import { color } from '../../../../theme/tokens';
import { layoutOf, SLIDE_TEXT_SIZE } from '../model';
import { freeClipItem, plugFirst, plugItem, PLUG_SAY, withPlug, type ReelPlanItem } from './plan';
import type { CtaPlacement, WeekBrief } from '../../../../lib/briefs-api';

const SPEECH_PAD_MS = 150;
const HEX = /^#[0-9A-Fa-f]{6}$/;

export function overlayIdFor(item: ReelPlanItem): string {
  return `pt-${item.id}`;
}

export function insetIdFor(item: ReelPlanItem): string {
  return `pi-${item.id}`;
}

/** Feature screenshot asset for the plug; one per feature, shared by items. */
export function insetAssetId(featureId: string): string {
  return `feat${featureId.replace(/[^A-Za-z0-9]/g, '')}`;
}

function blockIndex(doc: VideoDocument): Map<string, number> {
  return new Map(doc.blocks.map((b, i) => [b.id, i]));
}

/**
 * Timeline index for a new take of `itemId`, so the clips follow the plan:
 * after the item's own last block, else before the first block of the next
 * item that has one, else at the end. With `replace`, where its first block is.
 */
export function takeIndex(doc: VideoDocument, items: ReelPlanItem[], itemId: string, replace = false): number {
  const at = blockIndex(doc);
  const pos = items.findIndex((p) => p.id === itemId);
  const own = (pos >= 0 ? items[pos].blockIds : []).map((id) => at.get(id)).filter((i): i is number => i !== undefined);
  if (own.length > 0) return replace ? Math.min(...own) : Math.max(...own) + 1;
  for (let k = pos + 1; k < items.length && pos >= 0; k++) {
    const next = items[k].blockIds.map((id) => at.get(id)).filter((i): i is number => i !== undefined);
    if (next.length > 0) return Math.min(...next);
  }
  return doc.blocks.length;
}

/**
 * Put a take on the timeline at the item's place in the plan. `items` must
 * already hold the item (a new free clip included). With `replace` the
 * item's earlier takes come off in the same step.
 */
export function addTake(
  doc: VideoDocument,
  asset: MediaAsset,
  items: ReelPlanItem[],
  itemId: string,
  replace = false,
): { doc: VideoDocument; blockId: string | null } {
  const index = takeIndex(doc, items, itemId, replace);
  const block = singleBlock(clipForAsset(asset));
  let next = insertBlock(addAsset(doc, asset), block, index);
  if (replace) {
    const old = items.find((p) => p.id === itemId)?.blockIds ?? [];
    next = old.reduce((d, id) => deleteBlock(d, id), next);
  }
  return { doc: next, blockId: block.id };
}

/**
 * The timeline with a locked plug's clips back in their place: right after
 * the hook's last clip (first when the hook has none yet), or last. Any (the
 * creator places it) and a plug with no clips return the document as it is.
 */
export function lockPlug(doc: VideoDocument, items: ReelPlanItem[], place: CtaPlacement): VideoDocument {
  if (place === 'any') return doc;
  const plug = items.find((p) => p.role === 'cta');
  if (!plug) return doc;
  const ids = new Set(plug.blockIds);
  const mine = doc.blocks.filter((b) => ids.has(b.id));
  if (mine.length === 0) return doc;
  const rest = doc.blocks.filter((b) => !ids.has(b.id));
  let at = rest.length;
  if (place === 'after_hook') {
    const hook = new Set(items.find((p) => p.role === 'cover')?.blockIds ?? []);
    at = 0;
    rest.forEach((b, k) => {
      if (hook.has(b.id)) at = k + 1;
    });
  }
  const blocks = [...rest.slice(0, at), ...mine, ...rest.slice(at)];
  return blocks.every((b, k) => b === doc.blocks[k]) ? doc : { ...doc, blocks };
}

/** Output range covered by an item's blocks, or null when none are on the timeline. */
export function itemRange(doc: VideoDocument, item: ReelPlanItem): { startMs: number; endMs: number } | null {
  const ids = new Set(item.blockIds);
  const ranges = blockRanges(doc).filter((r) => ids.has(r.block.id));
  if (ranges.length === 0) return null;
  return {
    startMs: Math.min(...ranges.map((r) => r.startMs)),
    endMs: Math.max(...ranges.map((r) => r.endMs)),
  };
}

/** Box look from the brief's text style: bg none means plain letters. */
export function itemTextLook(item: ReelPlanItem): { bg: boolean; color: string } {
  const bg = item.tstyle?.bg ? item.tstyle.bg !== 'none' : true;
  const c = item.tstyle?.color;
  return { bg, color: c && HEX.test(c) ? c.toUpperCase() : color.white };
}

function layoutFor(item: ReelPlanItem) {
  return layoutOf({ box: item.box, insetBox: item.insetBox, insetFeatureId: item.insetFeatureId }, 'tiktok');
}

function overlayFor(item: ReelPlanItem, range: { startMs: number; endMs: number }): TextOverlay {
  const L = layoutFor(item);
  return {
    kind: 'text',
    id: overlayIdFor(item),
    text: item.text,
    ...itemTextLook(item),
    size: SLIDE_TEXT_SIZE * (item.tstyle?.size ?? 1),
    x: L.text.x,
    y: L.text.y,
    width: L.text.w,
    startMs: range.startMs,
    endMs: range.endMs,
  };
}

function insetFor(item: ReelPlanItem, assetId: string, range: { startMs: number; endMs: number }): ImageOverlay {
  const L = layoutFor(item);
  return {
    kind: 'image',
    id: insetIdFor(item),
    assetId,
    x: L.inset.x,
    y: L.inset.y,
    width: L.inset.w,
    startMs: range.startMs,
    endMs: range.endMs,
  };
}

/**
 * One text overlay per point with text and clips, spanning its clips, plus
 * the plug's feature screenshot when its asset is ready. Words and position
 * the creator already changed in the editor are kept; only the window
 * follows the clips. Items with no clips on the timeline are left alone, so
 * a plan that lost its block ids never strips text; removing a clip goes
 * through deleteItemBlocks.
 */
export function syncPlanOverlays(
  doc: VideoDocument,
  items: ReelPlanItem[],
  insetAssets: Record<string, MediaAsset> = {},
): VideoDocument {
  let next = doc;
  // Compare windows as the document stores them (rounded, clamped), so a
  // window that cannot match the clip exactly never re-syncs forever.
  const moved = (o: Overlay, range: { startMs: number; endMs: number }) => {
    const want = clampOverlayTimes({ ...o, ...range }, documentDurationMs(next));
    return want.startMs !== o.startMs || want.endMs !== o.endMs;
  };
  // One pass per item id: a plan that somehow repeats an id must never
  // fight over one overlay (each run would change the document again).
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    const range = itemRange(next, item);
    if (!range) continue;
    const id = overlayIdFor(item);
    const existing = next.overlays.find((o) => o.id === id);
    if (item.hideText) {
      // The creator deleted it; leave it gone.
    } else if (!item.text.trim()) {
      if (existing) next = removeOverlay(next, id);
    } else if (existing) {
      if (moved(existing, range)) next = updateOverlay(next, id, range);
    } else {
      next = addOverlay(next, overlayFor(item, range));
    }

    const pid = insetIdFor(item);
    const inset = next.overlays.find((o) => o.id === pid);
    const asset = item.insetFeatureId ? insetAssets[item.insetFeatureId] : undefined;
    if (!item.insetFeatureId) {
      if (inset) next = removeOverlay(next, pid);
    } else if (item.hideInset) {
      // The creator deleted it; leave it gone.
    } else if (inset) {
      if (moved(inset, range)) next = updateOverlay(next, pid, range);
    } else if (asset) {
      if (!assetById(next, asset.id)) next = addAsset(next, asset);
      next = addOverlay(next, insetFor(item, asset.id, range));
    }
  }
  return next;
}

/**
 * Remove clips, and the text and screenshot of every item left with no clip
 * on the timeline, in one step so undo brings all of it back.
 */
export function deleteItemBlocks(doc: VideoDocument, items: ReelPlanItem[], blockIds: string[]): VideoDocument {
  const gone = new Set(blockIds);
  const live = new Set(doc.blocks.map((b) => b.id));
  let next = doc;
  for (const item of items) {
    const had = item.blockIds.some((id) => live.has(id));
    const keeps = item.blockIds.some((id) => live.has(id) && !gone.has(id));
    if (!had || keeps) continue;
    next = removeOverlay(removeOverlay(next, overlayIdFor(item)), insetIdFor(item));
  }
  return blockIds.reduce((d, id) => deleteBlock(d, id), next);
}

export function removeBlocks(doc: VideoDocument, blockIds: string[]): VideoDocument {
  return blockIds.reduce((d, id) => deleteBlock(d, id), doc);
}

/**
 * Plan overlays the creator deleted (or that undo brought back) between two
 * documents: an item whose `pt-`/`pi-` overlay disappeared while its clips
 * stayed gets hideText/hideInset; one whose overlay is present again loses
 * the flag. Returns `items` itself when nothing changed.
 */
export function trackPlanOverlayDeletes(prev: VideoDocument | null, doc: VideoDocument, items: ReelPlanItem[]): ReelPlanItem[] {
  const now = new Set(doc.overlays.map((o) => o.id));
  const before = new Set(prev?.overlays.map((o) => o.id) ?? []);
  let changed = false;
  const out = items.map((item) => {
    const live = itemRange(doc, item) !== null;
    const flag = (id: string, current: boolean | undefined): boolean | undefined => {
      if (now.has(id)) return undefined;
      if (prev && before.has(id) && live) return true;
      return current;
    };
    const hideText = flag(overlayIdFor(item), item.hideText);
    const hideInset = flag(insetIdFor(item), item.hideInset);
    if (Boolean(hideText) === Boolean(item.hideText) && Boolean(hideInset) === Boolean(item.hideInset)) return item;
    changed = true;
    const { hideText: _t, hideInset: _i, ...rest } = item;
    return { ...rest, ...(hideText ? { hideText: true } : {}), ...(hideInset ? { hideInset: true } : {}) };
  });
  return changed ? out : items;
}

/** Blocks still on the timeline, so a plan never points at a deleted block. */
export function pruneBlockIds(doc: VideoDocument, items: ReelPlanItem[]): ReelPlanItem[] {
  const live = new Set(doc.blocks.map((b) => b.id));
  let changed = false;
  const out = items.map((item) => {
    const kept = item.blockIds.filter((id) => live.has(id));
    if (kept.length !== item.blockIds.length) changed = true;
    return kept.length === item.blockIds.length ? item : { ...item, blockIds: kept };
  });
  return changed ? out : items;
}

type Segment = { id: string | null; text: string; blockIds: string[] };

/**
 * Rebuild the block mapping from the document alone, for a plan that was
 * never saved with it (older drafts): blocks under one `pt-` text window
 * are one item, keyed by that window's id; blocks with no text are one item
 * each. Handheld and Long text fill the planned items in timeline order,
 * Story starts with the hook, and a clip under a feature screenshot or the
 * brief's plug line is the plug.
 */
export function recoverPlan(brief: WeekBrief, doc: VideoDocument, fresh: ReelPlanItem[]): ReelPlanItem[] {
  if (doc.blocks.length === 0) return fresh;
  const texts = doc.overlays.filter((o): o is TextOverlay => o.kind === 'text' && o.id.startsWith('pt-'));
  const plugIds = new Set(doc.overlays.filter((o) => o.id.startsWith('pi-')).map((o) => o.id.slice(3)));
  const segments: Segment[] = [];
  for (const r of blockRanges(doc)) {
    let best: TextOverlay | null = null;
    let bestOverlap = 0;
    for (const o of texts) {
      const overlap = Math.min(r.endMs, o.endMs) - Math.max(r.startMs, o.startMs);
      if (overlap > bestOverlap) {
        best = o;
        bestOverlap = overlap;
      }
    }
    const owner = best && bestOverlap * 2 >= r.endMs - r.startMs ? best : null;
    const id = owner ? owner.id.slice(3) : null;
    const last = segments[segments.length - 1];
    if (last && id !== null && last.id === id) last.blockIds.push(r.block.id);
    else segments.push({ id, text: owner?.text ?? '', blockIds: [r.block.id] });
  }

  // A text window that owns clips that are not next to each other gives two
  // segments the same id; only the first keeps it.
  const taken = new Set<string>();
  for (const seg of segments) {
    if (seg.id === null) continue;
    if (taken.has(seg.id)) seg.id = null;
    else taken.add(seg.id);
  }
  const asFree = (seg: Segment): ReelPlanItem => ({ ...freeClipItem(), ...(seg.id ? { id: seg.id } : {}), text: seg.text, blockIds: seg.blockIds });
  if (brief.kind === 'handheld' || brief.postTypeKey === 'long_text') {
    const out = fresh.map((f, k) => (segments[k] ? { ...f, ...(segments[k].id ? { id: segments[k].id } : {}), blockIds: segments[k].blockIds } : f));
    return [...out, ...segments.slice(fresh.length).map(asFree)];
  }
  const plugLine = brief.cta.text.trim();
  const plannedLine = fresh.find((p) => p.role === 'cta')?.text.trim() ?? '';
  const isPlug = (seg: Segment) =>
    (seg.id !== null && plugIds.has(seg.id)) || (plugLine !== '' && seg.text.trim() === plugLine) || (plannedLine !== '' && seg.text.trim() === plannedLine);
  const rest = [...segments];
  const out: ReelPlanItem[] = [];
  const cover = fresh.find((p) => p.role === 'cover');
  if (cover) {
    const seg = rest.shift();
    out.push(seg ? { ...cover, ...(seg.id ? { id: seg.id } : {}), blockIds: seg.blockIds } : cover);
  }
  let plug: ReelPlanItem | null = null;
  let plugAt = -1;
  for (const seg of rest) {
    if (!plug && isPlug(seg)) {
      plug = { ...plugItem(seg.text || plugLine, brief.cta.featureId, PLUG_SAY), ...(seg.id ? { id: seg.id } : {}), blockIds: seg.blockIds };
      plugAt = out.length;
    } else {
      out.push(asFree(seg));
    }
  }
  // CTA right after the hook: a recorded plug keeps its place on the
  // timeline; with none recorded the planned plug goes right after the hook.
  if (plugFirst(brief)) {
    if (plug) return [...out.slice(0, plugAt), plug, ...out.slice(plugAt)];
    const planned = fresh.find((p) => p.role === 'cta');
    return planned ? withPlug(out, planned, true) : out;
  }
  return plug ? [...out, plug] : out;
}

export type DeadAirCut = { blockId: string; assetId: string; inMs: number; outMs: number };

/**
 * Speech bounds for every clip, as cuts to apply later. iOS only. Blocks in
 * `skip` (Long text takes, which must stay their full length) are left out.
 */
export async function findDeadAir(doc: VideoDocument, skip: ReadonlySet<string> = new Set()): Promise<DeadAirCut[]> {
  if (!isVideoEditorAvailable()) return [];
  const cuts: DeadAirCut[] = [];
  for (const block of doc.blocks) {
    if (skip.has(block.id)) continue;
    const cell = block.cells[0];
    const asset = doc.assets.find((a) => a.id === cell?.assetId);
    if (!cell || !asset || asset.kind !== 'video' || !asset.localUri) continue;
    try {
      const bounds = await speechBounds(asset.localUri);
      if (bounds.durationMs <= 0) continue;
      const inMs = Math.max(cell.inMs, bounds.startMs - SPEECH_PAD_MS);
      const outMs = Math.min(cell.outMs, bounds.endMs + SPEECH_PAD_MS);
      if (outMs - inMs < MIN_CLIP_MS) continue;
      if (inMs <= cell.inMs && outMs >= cell.outMs) continue;
      cuts.push({ blockId: block.id, assetId: asset.id, inMs, outMs });
    } catch {
      // A clip the analyzer cannot read keeps its full length.
    }
  }
  return cuts;
}

/**
 * Apply cuts to the document as it is now. A block deleted or re-recorded
 * while the analysis ran is skipped; a trim made meanwhile is only narrowed.
 */
export function applyDeadAirCuts(doc: VideoDocument, cuts: DeadAirCut[]): VideoDocument {
  let next = doc;
  for (const cut of cuts) {
    const cell = next.blocks.find((b) => b.id === cut.blockId)?.cells[0];
    if (!cell || cell.assetId !== cut.assetId) continue;
    const inMs = Math.max(cell.inMs, cut.inMs);
    const outMs = Math.min(cell.outMs, cut.outMs);
    if (outMs - inMs < MIN_CLIP_MS || (inMs === cell.inMs && outMs === cell.outMs)) continue;
    next = updateCell(next, cut.blockId, 0, { inMs, outMs });
  }
  if (next === doc) return doc;
  const total = documentDurationMs(next);
  return { ...next, overlays: next.overlays.map((o) => clampOverlayTimes(o, total)) };
}
