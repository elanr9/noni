// Non destructive edit model for a recorded video post. Every brief slot's
// clip becomes one or more pieces; a piece is a source range played at a
// speed, optionally muted and cropped. Pieces never leave their slot so the
// render pass keeps its one clip per slot_index contract, and on-screen
// text and screenshots still line up with the segment they were written for.
import type { Json } from './types';

export const EDIT_SPEEDS = [0.5, 1, 1.5, 2, 3] as const;
export type EditSpeed = (typeof EDIT_SPEEDS)[number];

/** Zoom about the frame center (scale >= 1) plus a pan expressed as a
 * fraction of the frame size, so the same crop applies at any resolution. */
export type EditCrop = { scale: number; x: number; y: number };

export type EditPiece = {
  id: string;
  slotIndex: number;
  sourceUri: string;
  sourceDurationMs: number;
  /** Source range, in source milliseconds. */
  inMs: number;
  outMs: number;
  speed: EditSpeed;
  muted: boolean;
  crop: EditCrop | null;
};

export type EditTimeline = { pieces: EditPiece[] };

/** Shortest source range a piece may keep. */
export const MIN_PIECE_MS = 300;
export const MAX_CROP_SCALE = 3;

let nextId = 0;
export function newPieceId(): string {
  nextId += 1;
  return `p${Date.now().toString(36)}${nextId}`;
}

export function pieceDurationMs(piece: EditPiece): number {
  return Math.round((piece.outMs - piece.inMs) / piece.speed);
}

export function timelineDurationMs(timeline: EditTimeline): number {
  return timeline.pieces.reduce((sum, p) => sum + pieceDurationMs(p), 0);
}

export type PieceRange = { piece: EditPiece; startMs: number; endMs: number };

export function pieceRanges(timeline: EditTimeline): PieceRange[] {
  let cursor = 0;
  return timeline.pieces.map((piece) => {
    const startMs = cursor;
    cursor += pieceDurationMs(piece);
    return { piece, startMs, endMs: cursor };
  });
}

/** Piece under a timeline position. The last piece owns its end boundary. */
export function pieceAt(
  timeline: EditTimeline,
  timelineMs: number,
): PieceRange | null {
  const ranges = pieceRanges(timeline);
  if (ranges.length === 0) return null;
  const t = Math.max(0, timelineMs);
  return ranges.find((r) => t >= r.startMs && t < r.endMs) ?? ranges[ranges.length - 1];
}

export function clampSpeed(value: number): EditSpeed {
  return EDIT_SPEEDS.reduce((best, s) =>
    Math.abs(s - value) < Math.abs(best - value) ? s : best,
  );
}

export function identityTimeline(
  slots: { slotIndex: number; sourceUri: string; durationMs: number }[],
): EditTimeline {
  return {
    pieces: [...slots]
      .sort((a, b) => a.slotIndex - b.slotIndex)
      .map((s) => ({
        id: newPieceId(),
        slotIndex: s.slotIndex,
        sourceUri: s.sourceUri,
        sourceDurationMs: s.durationMs,
        inMs: 0,
        outMs: s.durationMs,
        speed: 1,
        muted: false,
        crop: null,
      })),
  };
}

/** True when the slot plays back exactly as recorded, so no export is needed. */
export function slotIsUntouched(timeline: EditTimeline, slotIndex: number): boolean {
  const pieces = timeline.pieces.filter((p) => p.slotIndex === slotIndex);
  if (pieces.length !== 1) return false;
  const p = pieces[0];
  return (
    p.inMs === 0 &&
    p.outMs === p.sourceDurationMs &&
    p.speed === 1 &&
    !p.muted &&
    p.crop === null
  );
}

export function slotIndices(timeline: EditTimeline): number[] {
  return [...new Set(timeline.pieces.map((p) => p.slotIndex))].sort((a, b) => a - b);
}

export function slotPieces(timeline: EditTimeline, slotIndex: number): EditPiece[] {
  return timeline.pieces.filter((p) => p.slotIndex === slotIndex);
}

/** Split the piece under the playhead into two. Returns the same timeline
 * when the cut would leave either side shorter than MIN_PIECE_MS. */
export function splitAt(timeline: EditTimeline, timelineMs: number): EditTimeline {
  const hit = pieceAt(timeline, timelineMs);
  if (!hit) return timeline;
  const { piece, startMs } = hit;
  const sourceCut = piece.inMs + (timelineMs - startMs) * piece.speed;
  if (sourceCut - piece.inMs < MIN_PIECE_MS || piece.outMs - sourceCut < MIN_PIECE_MS) {
    return timeline;
  }
  const cut = Math.round(sourceCut);
  const left: EditPiece = { ...piece, outMs: cut };
  const right: EditPiece = { ...piece, id: newPieceId(), inMs: cut };
  return {
    pieces: timeline.pieces.flatMap((p) => (p.id === piece.id ? [left, right] : [p])),
  };
}

export function canSplitAt(timeline: EditTimeline, timelineMs: number): boolean {
  return splitAt(timeline, timelineMs) !== timeline;
}

export function canDeletePiece(timeline: EditTimeline, pieceId: string): boolean {
  return timeline.pieces.length > 1 && timeline.pieces.some((p) => p.id === pieceId);
}

export function deletePiece(timeline: EditTimeline, pieceId: string): EditTimeline {
  if (!canDeletePiece(timeline, pieceId)) return timeline;
  return { pieces: timeline.pieces.filter((p) => p.id !== pieceId) };
}

export function updatePiece(
  timeline: EditTimeline,
  pieceId: string,
  patch: Partial<Pick<EditPiece, 'speed' | 'muted' | 'crop'>>,
): EditTimeline {
  return {
    pieces: timeline.pieces.map((p) => (p.id === pieceId ? { ...p, ...patch } : p)),
  };
}

export function setAllMuted(timeline: EditTimeline, muted: boolean): EditTimeline {
  return { pieces: timeline.pieces.map((p) => ({ ...p, muted })) };
}

/** Clamp a requested trim so the piece stays inside its source and keeps at
 * least MIN_PIECE_MS. Either edge may be omitted to leave it alone. */
export function clampTrim(
  piece: EditPiece,
  edges: { inMs?: number; outMs?: number },
): { inMs: number; outMs: number } {
  let inMs = edges.inMs ?? piece.inMs;
  let outMs = edges.outMs ?? piece.outMs;
  inMs = Math.max(0, Math.min(inMs, piece.sourceDurationMs - MIN_PIECE_MS));
  outMs = Math.min(piece.sourceDurationMs, Math.max(outMs, MIN_PIECE_MS));
  if (edges.inMs !== undefined && edges.outMs === undefined) {
    inMs = Math.min(inMs, outMs - MIN_PIECE_MS);
  } else if (edges.outMs !== undefined && edges.inMs === undefined) {
    outMs = Math.max(outMs, inMs + MIN_PIECE_MS);
  } else if (outMs - inMs < MIN_PIECE_MS) {
    outMs = Math.min(piece.sourceDurationMs, inMs + MIN_PIECE_MS);
    inMs = outMs - MIN_PIECE_MS;
  }
  return { inMs: Math.round(inMs), outMs: Math.round(outMs) };
}

export function trimPiece(
  timeline: EditTimeline,
  pieceId: string,
  edges: { inMs?: number; outMs?: number },
): EditTimeline {
  const piece = timeline.pieces.find((p) => p.id === pieceId);
  if (!piece) return timeline;
  const next = clampTrim(piece, edges);
  if (next.inMs === piece.inMs && next.outMs === piece.outMs) return timeline;
  return {
    pieces: timeline.pieces.map((p) => (p.id === pieceId ? { ...p, ...next } : p)),
  };
}

/** Swap a slot's recording for a fresh one; the slot goes back to a single
 * untouched piece because the old trims meant nothing on the new clip. */
export function replaceSlot(
  timeline: EditTimeline,
  slot: { slotIndex: number; sourceUri: string; durationMs: number },
): EditTimeline {
  const fresh = identityTimeline([slot]).pieces[0];
  const without = timeline.pieces.filter((p) => p.slotIndex !== slot.slotIndex);
  const after = without.findIndex((p) => p.slotIndex > slot.slotIndex);
  const pieces =
    after === -1
      ? [...without, fresh]
      : [...without.slice(0, after), fresh, ...without.slice(after)];
  return { pieces };
}

/** Timeline position of the start of a source time inside a piece. */
export function sourceToTimelineMs(
  timeline: EditTimeline,
  pieceId: string,
  sourceMs: number,
): number {
  const range = pieceRanges(timeline).find((r) => r.piece.id === pieceId);
  if (!range) return 0;
  const clamped = Math.max(range.piece.inMs, Math.min(sourceMs, range.piece.outMs));
  return range.startMs + Math.round((clamped - range.piece.inMs) / range.piece.speed);
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function formatSeconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}

// Persistence. Edits are saved per slot without the source uri, since the
// clip is re-resolved from the draft (local file or signed url) on load.

export type StoredPiece = {
  in_ms: number;
  out_ms: number;
  speed: EditSpeed;
  muted: boolean;
  crop: EditCrop | null;
};

export type StoredEdits = Record<string, StoredPiece[]>;

export function serializeEdits(timeline: EditTimeline): StoredEdits {
  const out: StoredEdits = {};
  for (const slot of slotIndices(timeline)) {
    if (slotIsUntouched(timeline, slot)) continue;
    out[String(slot)] = slotPieces(timeline, slot).map((p) => ({
      in_ms: p.inMs,
      out_ms: p.outMs,
      speed: p.speed,
      muted: p.muted,
      crop: p.crop,
    }));
  }
  return out;
}

function isSpeed(value: unknown): value is EditSpeed {
  return typeof value === 'number' && (EDIT_SPEEDS as readonly number[]).includes(value);
}

function parseCrop(value: unknown): EditCrop | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.scale !== 'number' ||
    typeof raw.x !== 'number' ||
    typeof raw.y !== 'number'
  ) {
    return null;
  }
  return {
    scale: Math.max(1, Math.min(MAX_CROP_SCALE, raw.scale)),
    x: Math.max(-0.5, Math.min(0.5, raw.x)),
    y: Math.max(-0.5, Math.min(0.5, raw.y)),
  };
}

export function parseStoredEdits(value: Json | null | undefined): StoredEdits {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const out: StoredEdits = {};
  for (const [slot, list] of Object.entries(value)) {
    if (!Array.isArray(list)) continue;
    const pieces: StoredPiece[] = [];
    for (const entry of list) {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const raw = entry as Record<string, unknown>;
      if (
        typeof raw.in_ms !== 'number' ||
        typeof raw.out_ms !== 'number' ||
        !isSpeed(raw.speed) ||
        typeof raw.muted !== 'boolean'
      ) {
        continue;
      }
      pieces.push({
        in_ms: raw.in_ms,
        out_ms: raw.out_ms,
        speed: raw.speed,
        muted: raw.muted,
        crop: parseCrop(raw.crop),
      });
    }
    if (pieces.length > 0) out[slot] = pieces;
  }
  return out;
}

/** Rebuild a timeline from recorded slots plus stored edits. Edits that no
 * longer fit their clip (a retake changed the length) fall back to untouched. */
export function timelineFromStored(
  slots: { slotIndex: number; sourceUri: string; durationMs: number }[],
  stored: StoredEdits,
): EditTimeline {
  const pieces: EditPiece[] = [];
  for (const slot of [...slots].sort((a, b) => a.slotIndex - b.slotIndex)) {
    const saved = stored[String(slot.slotIndex)];
    const fits =
      saved !== undefined &&
      saved.every(
        (p) =>
          p.in_ms >= 0 &&
          p.out_ms <= slot.durationMs &&
          p.out_ms - p.in_ms >= MIN_PIECE_MS,
      );
    if (saved === undefined || !fits) {
      pieces.push(...identityTimeline([slot]).pieces);
      continue;
    }
    for (const p of saved) {
      pieces.push({
        id: newPieceId(),
        slotIndex: slot.slotIndex,
        sourceUri: slot.sourceUri,
        sourceDurationMs: slot.durationMs,
        inMs: p.in_ms,
        outMs: p.out_ms,
        speed: p.speed,
        muted: p.muted,
        crop: p.crop,
      });
    }
  }
  return { pieces };
}
