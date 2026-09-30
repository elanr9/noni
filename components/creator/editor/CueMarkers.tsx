// Cue lane above the frame strip: per slot, a Text chip spanning the on
// screen text hold and a phone glyph where the screenshot enters. Both drag
// inside their own slot; the parent owns the cue values and the playhead.
import { memo, useCallback, useRef, type ComponentProps, type JSX, type ReactNode } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { Smartphone } from 'lucide-react-native';

import {
  pieceDurationMs,
  pieceRanges,
  slotPieces,
  type EditPiece,
  type EditTimeline,
  type SlotCue,
} from '../../../lib/video-edit';
import { color, type } from '../../../theme/tokens';

export const MIN_TEXT_HOLD_MS = 500;

export type SourceWindow = { startMs: number; endMs: number };

/**
 * Source ms window the on-screen text covers, matching the render pass: the
 * whole clip. Text timing is not adjustable; only the screenshot has a cue.
 */
export function slotTextWindow(_cue: SlotCue | null, pieces: EditPiece[]): SourceWindow {
  const first = pieces[0];
  const last = pieces[pieces.length - 1];
  return { startMs: first ? first.inMs : 0, endMs: last ? last.outMs : 0 };
}

export const CUE_ROW_H = 18;
export const CUE_ROW_GAP = 2;

const CHIP_MIN_W = 28;
const GLYPH_W = 22;
const DRAG_THRESHOLD_PX = 3;
const THROTTLE_MS = 33;

export type CueKind = 'text' | 'media';
export type CueDragKind = CueKind | 'hold';

export type CueSelection = { slotIndex: number; kind: CueKind };

/** A marker moved to `sourceMs` (for 'hold', the source ms where the text ends). */
export type CueDrag = { slotIndex: number; kind: CueDragKind; sourceMs: number };

export type CueSlot = {
  slotIndex: number;
  label: string;
  hasText: boolean;
  hasMedia: boolean;
  cue: SlotCue | null;
  pending: boolean;
};

export type CuePieceLayout = { piece: EditPiece; x: number; width: number };

/**
 * Where a source ms of one slot lands in that slot's exported clip: pieces
 * play in order at their speeds, a ms in a trimmed away gap snaps to the
 * start of the next piece, a ms past the last piece lands at the end.
 */
export function sourceToSlotOutputMs(pieces: EditPiece[], sourceMs: number): number {
  let acc = 0;
  for (const p of pieces) {
    if (sourceMs < p.inMs) return acc;
    if (sourceMs <= p.outMs) return acc + Math.round((sourceMs - p.inMs) / p.speed);
    acc += pieceDurationMs(p);
  }
  return acc;
}

export function slotTimelineRange(
  timeline: EditTimeline,
  slotIndex: number,
): { startMs: number; endMs: number } | null {
  const ranges = pieceRanges(timeline).filter((r) => r.piece.slotIndex === slotIndex);
  if (ranges.length === 0) return null;
  return { startMs: ranges[0].startMs, endMs: ranges[ranges.length - 1].endMs };
}

/** Editor timeline position of a source ms inside one slot. */
export function slotSourceToTimelineMs(
  timeline: EditTimeline,
  slotIndex: number,
  sourceMs: number,
): number {
  const range = slotTimelineRange(timeline, slotIndex);
  if (!range) return 0;
  return range.startMs + sourceToSlotOutputMs(slotPieces(timeline, slotIndex), sourceMs);
}

function xForSource(pieces: CuePieceLayout[], pxPerMs: number, sourceMs: number): number {
  for (const p of pieces) {
    if (sourceMs < p.piece.inMs) return p.x;
    if (sourceMs <= p.piece.outMs) {
      return p.x + ((sourceMs - p.piece.inMs) / p.piece.speed) * pxPerMs;
    }
  }
  const last = pieces[pieces.length - 1];
  return last ? last.x + last.width : 0;
}

function sourceForX(pieces: CuePieceLayout[], pxPerMs: number, x: number): number {
  const first = pieces[0];
  if (!first) return 0;
  if (x <= first.x) return first.piece.inMs;
  for (const p of pieces) {
    if (x < p.x) return p.piece.inMs;
    if (x <= p.x + p.width) {
      return Math.round(p.piece.inMs + ((x - p.x) / pxPerMs) * p.piece.speed);
    }
  }
  return pieces[pieces.length - 1].piece.outMs;
}

export type CueLaneProps = {
  slots: CueSlot[];
  pieces: CuePieceLayout[];
  pxPerMs: number;
  showMediaRow: boolean;
  selected: CueSelection | null;
  onSelect: (selection: CueSelection) => void;
  onDragStart: () => void;
  onDragPreview: (drag: CueDrag) => void;
  onDragEnd: (drag: CueDrag) => void;
};

export function CueLane(props: CueLaneProps): JSX.Element {
  const { slots, pieces, pxPerMs, showMediaRow, selected, onSelect, onDragStart, onDragPreview, onDragEnd } =
    props;
  return (
    <View style={{ height: showMediaRow ? CUE_ROW_H * 2 + CUE_ROW_GAP : CUE_ROW_H }}>
      {slots.map((slot) => {
        const own = pieces.filter((p) => p.piece.slotIndex === slot.slotIndex);
        if (own.length === 0) return null;
        return (
          <SlotCueMarkers
            key={slot.slotIndex}
            slot={slot}
            pieces={own}
            pxPerMs={pxPerMs}
            selectedKind={selected?.slotIndex === slot.slotIndex ? selected.kind : null}
            onSelect={onSelect}
            onDragStart={onDragStart}
            onDragPreview={onDragPreview}
            onDragEnd={onDragEnd}
          />
        );
      })}
    </View>
  );
}

const SlotCueMarkers = memo(function SlotCueMarkers(props: {
  slot: CueSlot;
  pieces: CuePieceLayout[];
  pxPerMs: number;
  selectedKind: CueKind | null;
  onSelect: (selection: CueSelection) => void;
  onDragStart: () => void;
  onDragPreview: (drag: CueDrag) => void;
  onDragEnd: (drag: CueDrag) => void;
}): JSX.Element {
  const { slot, pieces, pxPerMs, selectedKind } = props;
  const cue = slot.cue;
  const creator = cue?.source === 'creator';
  const textWindow = slotTextWindow(
    cue,
    pieces.map((p) => p.piece),
  );
  const textX = xForSource(pieces, pxPerMs, textWindow.startMs);
  const textW = Math.max(CHIP_MIN_W, xForSource(pieces, pxPerMs, textWindow.endMs) - textX);
  const mediaX = xForSource(pieces, pxPerMs, cue?.media_start_ms ?? 0);
  const slotStart = pieces[0].x;
  const slotEnd = pieces[pieces.length - 1].x + pieces[pieces.length - 1].width;

  const toSource = useCallback(
    (x: number) => sourceForX(pieces, pxPerMs, Math.max(slotStart, Math.min(slotEnd, x))),
    [pieces, pxPerMs, slotStart, slotEnd],
  );

  return (
    <>
      {slot.hasText ? (
        // The text chip only shows where the words sit: on screen for the whole clip.
        <View
          pointerEvents="none"
          style={[styles.chip, { left: textX, width: textW }, styles.ai, slot.pending && styles.pending]}
        >
          {slot.pending ? (
            <ActivityIndicator size="small" color={color.white} style={styles.spinner} />
          ) : null}
          <Text style={styles.chipText} numberOfLines={1}>
            {slot.label}
          </Text>
        </View>
      ) : null}
      {slot.hasMedia ? (
        <CueHandle
          kind="media"
          slotIndex={slot.slotIndex}
          x={mediaX}
          toSource={toSource}
          selected={selectedKind === 'media'}
          onSelect={props.onSelect}
          onDragStart={props.onDragStart}
          onDragPreview={props.onDragPreview}
          onDragEnd={props.onDragEnd}
          style={[
            styles.glyph,
            { left: mediaX, top: CUE_ROW_H + CUE_ROW_GAP },
            creator ? styles.creator : styles.ai,
            slot.pending && styles.pending,
            selectedKind === 'media' && styles.selected,
          ]}
        >
          <Smartphone size={12} color={color.white} strokeWidth={2.2} />
        </CueHandle>
      ) : null}
    </>
  );
});

type CueHandleProps = {
  kind: CueDragKind;
  slotIndex: number;
  /** Strip x of the marker's anchor, so a drag is anchor plus finger delta. */
  x: number;
  toSource: (x: number) => number;
  selected: boolean;
  onSelect: (selection: CueSelection) => void;
  onDragStart: () => void;
  onDragPreview: (drag: CueDrag) => void;
  onDragEnd: (drag: CueDrag) => void;
  style: ComponentProps<typeof View>['style'];
  children: ReactNode;
};

/** A tap selects the marker; a horizontal drag moves it and reports source ms. */
function CueHandle(props: CueHandleProps): JSX.Element {
  const { kind, slotIndex, x, toSource, onSelect, onDragStart, onDragPreview, onDragEnd } = props;
  const dragRef = useRef({ dragging: false, sourceMs: 0, sentAt: 0, startPageX: 0 });

  function finish() {
    const drag = dragRef.current;
    if (drag.dragging) {
      onDragEnd({ slotIndex, kind, sourceMs: drag.sourceMs });
    } else if (kind !== 'hold') {
      onSelect({ slotIndex, kind });
    }
    drag.dragging = false;
  }

  function move(evt: GestureResponderEvent) {
    const drag = dragRef.current;
    const dx = evt.nativeEvent.pageX - drag.startPageX;
    if (!drag.dragging) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      drag.dragging = true;
      onDragStart();
    }
    const sourceMs = toSource(x + dx);
    drag.sourceMs = sourceMs;
    const now = Date.now();
    if (now - drag.sentAt < THROTTLE_MS) return;
    drag.sentAt = now;
    onDragPreview({ slotIndex, kind, sourceMs });
  }

  const label = kind === 'text' ? 'Text timing' : kind === 'media' ? 'Screenshot timing' : 'Text hold';

  return (
    <View
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(evt: GestureResponderEvent) => {
        dragRef.current = {
          dragging: false,
          sourceMs: 0,
          sentAt: 0,
          startPageX: evt.nativeEvent.pageX,
        };
      }}
      onResponderMove={move}
      onResponderRelease={finish}
      onResponderTerminate={finish}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityState={{ selected: props.selected }}
      style={props.style}
    >
      {props.children}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    position: 'absolute',
    top: 0,
    height: CUE_ROW_H,
    borderRadius: CUE_ROW_H / 2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    overflow: 'visible',
    zIndex: 2,
  },
  glyph: {
    position: 'absolute',
    width: GLYPH_W,
    height: CUE_ROW_H,
    borderRadius: CUE_ROW_H / 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  ai: { backgroundColor: 'rgba(255,255,255,0.22)' },
  creator: { backgroundColor: color.accent },
  pending: { opacity: 0.5 },
  selected: { borderWidth: 1.5, borderColor: color.white, zIndex: 3 },
  chipText: {
    flex: 1,
    color: color.white,
    fontSize: type.size.micro,
    lineHeight: 12,
    fontWeight: type.weight.semibold,
  },
  spinner: { transform: [{ scale: 0.5 }], marginRight: -2 },
});
