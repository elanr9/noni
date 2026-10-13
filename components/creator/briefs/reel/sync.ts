// Plan to document. The studio VideoDocument holds the clips, their trims
// and the text overlays; the plan says which block belongs to which point.
// Text overlays are keyed `pt-<item id>` so re-syncing never duplicates.
import {
  addOverlay,
  appendAssetBlock,
  blockRanges,
  deleteBlock,
  MIN_CLIP_MS,
  removeOverlay,
  updateCell,
  updateOverlay,
  type MediaAsset,
  type TextOverlay,
  type VideoDocument,
} from '../../../../lib/edit-document';
import { isVideoEditorAvailable, speechBounds } from '../../../../modules/video-editor';
import { color } from '../../../../theme/tokens';
import { layoutOf, SLIDE_TEXT_SIZE } from '../model';
import type { ReelPlanItem } from './plan';

const SPEECH_PAD_MS = 150;

export function overlayIdFor(item: ReelPlanItem): string {
  return `pt-${item.id}`;
}

/** Append a take; the new block is the last one. */
export function addTake(doc: VideoDocument, asset: MediaAsset): { doc: VideoDocument; blockId: string | null } {
  const next = appendAssetBlock(doc, asset);
  if (next === doc) return { doc, blockId: null };
  return { doc: next, blockId: next.blocks[next.blocks.length - 1]?.id ?? null };
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

function overlayFor(item: ReelPlanItem, range: { startMs: number; endMs: number }): TextOverlay {
  const L = layoutOf({ box: item.box, insetBox: item.insetBox, insetFeatureId: item.insetFeatureId }, 'tiktok');
  return {
    kind: 'text',
    id: overlayIdFor(item),
    text: item.text,
    color: color.white,
    bg: true,
    size: SLIDE_TEXT_SIZE * (item.tstyle?.size ?? 1),
    x: L.text.x,
    y: L.text.y,
    width: L.text.w,
    startMs: range.startMs,
    endMs: range.endMs,
  };
}

/**
 * One text overlay per point with text and clips, spanning its clips. Words
 * and position the creator already changed in the editor are kept; only the
 * window follows the clips.
 */
export function syncPlanOverlays(doc: VideoDocument, items: ReelPlanItem[]): VideoDocument {
  let next = doc;
  for (const item of items) {
    const id = overlayIdFor(item);
    const existing = next.overlays.find((o) => o.id === id);
    const range = item.text.trim() ? itemRange(next, item) : null;
    if (!range) {
      if (existing) next = removeOverlay(next, id);
      continue;
    }
    if (existing) {
      if (existing.startMs !== range.startMs || existing.endMs !== range.endMs) next = updateOverlay(next, id, range);
    } else {
      next = addOverlay(next, overlayFor(item, range));
    }
  }
  return next;
}

export function removeBlocks(doc: VideoDocument, blockIds: string[]): VideoDocument {
  return blockIds.reduce((d, id) => deleteBlock(d, id), doc);
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

/** Trim every clip to the speech the device hears in it. iOS only. */
export async function cutDeadAir(doc: VideoDocument): Promise<{ doc: VideoDocument; cuts: number }> {
  if (!isVideoEditorAvailable()) return { doc, cuts: 0 };
  let next = doc;
  let cuts = 0;
  for (const block of doc.blocks) {
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
      next = updateCell(next, block.id, 0, { inMs, outMs });
      cuts += 1;
    } catch {
      // A clip the analyzer cannot read keeps its full length.
    }
  }
  return { doc: next, cuts };
}
