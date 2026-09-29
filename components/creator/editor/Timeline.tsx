// TikTok style timeline strip. Fully controlled: the parent owns the edit
// model and the player position; this component only reports scrub, trim,
// select and zoom gestures. The strip scrolls under a fixed centre playhead,
// so scroll offset and timeline time are the same axis (minus piece gaps).
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from 'react';
import {
  Animated,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type PanResponderInstance,
} from 'react-native';

import {
  clampTrim,
  formatClock,
  formatSeconds,
  pieceDurationMs,
  pieceRanges,
  type EditPiece,
  type EditTimeline,
  type PieceRange,
} from '../../../lib/video-edit';
import { color, type } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import {
  CUE_ROW_GAP,
  CUE_ROW_H,
  CueLane,
  type CueDrag,
  type CueSelection,
  type CueSlot,
} from './CueMarkers';
import type { Playhead } from './playhead';
import { useClipFrames } from './useClipFrames';
import { useEvent } from './useEvent';

export type TrimEdges = { inMs?: number; outMs?: number };

export type TimelineProps = {
  timeline: EditTimeline;
  /** Frame rate playhead owned by the parent; the strip follows it imperatively. */
  playhead: Playhead;
  playing: boolean;
  selectedPieceId: string | null;
  onSelectPiece: (pieceId: string | null) => void;
  /** User started scrubbing or trimming; parent pauses playback. */
  onScrubStart: () => void;
  /** Fires while the user drags the strip, throttled to ~30/s. */
  onScrub: (positionMs: number) => void;
  /** Fires once when the strip settles (drag end without momentum, or momentum end). */
  onScrubEnd: (positionMs: number) => void;
  /** Live while a trim handle moves. Edges are raw requests; the parent clamps with clampTrim. */
  onTrimPreview: (pieceId: string, edges: TrimEdges) => void;
  onTrimCommit: (pieceId: string, edges: TrimEdges) => void;
  allMuted: boolean;
  onToggleAllMuted: () => void;
  /** Slots with on screen text or a screenshot; empty hides the cue lane. */
  cueSlots: CueSlot[];
  selectedCue: CueSelection | null;
  onSelectCue: (selection: CueSelection) => void;
  /** Live while a cue marker moves; source ms inside the marker's slot. */
  onCuePreview: (drag: CueDrag) => void;
  onCueCommit: (drag: CueDrag) => void;
};

const RAIL_W = 44;
const RULER_H = 22;
const RULER_GAP = 8;
const CUE_GAP = 6;
const TRACK_H = 56;
const PAD_TOP = 12;
const PAD_BOTTOM = 16;
const CONTENT_H = RULER_H + RULER_GAP + TRACK_H;
export const TIMELINE_HEIGHT = PAD_TOP + CONTENT_H + PAD_BOTTOM;

function cueLaneHeight(slots: CueSlot[]): number {
  if (slots.length === 0) return 0;
  const rows = slots.some((s) => s.hasMedia) ? 2 : 1;
  return rows * CUE_ROW_H + (rows - 1) * CUE_ROW_GAP + CUE_GAP;
}

const PIECE_RADIUS = 8;
const HANDLE_W = 22;
const SAME_SLOT_GAP = 2;
const SLOT_GAP = 6;
const MIN_PX_PER_SEC = 24;
const MAX_PX_PER_SEC = 320;
const DEFAULT_PX_PER_SEC = 56;
const THROTTLE_MS = 33;
const LABEL_W = 44;
/** A trim edge this close to the playhead line locks onto it. */
const SNAP_PX = 6;

type PieceLayout = { range: PieceRange; x: number; width: number };
type StripLayout = { pieces: PieceLayout[]; totalWidth: number; totalMs: number };

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function buildLayout(timeline: EditTimeline, pxPerMs: number): StripLayout {
  const ranges = pieceRanges(timeline);
  const pieces: PieceLayout[] = [];
  let x = 0;
  ranges.forEach((range, i) => {
    if (i > 0) {
      const prev = ranges[i - 1].piece;
      x += prev.slotIndex === range.piece.slotIndex ? SAME_SLOT_GAP : SLOT_GAP;
    }
    const width = pieceDurationMs(range.piece) * pxPerMs;
    pieces.push({ range, x, width });
    x += width;
  });
  const last = ranges[ranges.length - 1];
  return { pieces, totalWidth: x, totalMs: last ? last.endMs : 0 };
}

function offsetForMs(layout: StripLayout, pxPerMs: number, ms: number): number {
  const t = clamp(ms, 0, layout.totalMs);
  const hit =
    layout.pieces.find((p) => t >= p.range.startMs && t < p.range.endMs) ??
    layout.pieces[layout.pieces.length - 1];
  if (!hit) return 0;
  return hit.x + (t - hit.range.startMs) * pxPerMs;
}

function msForOffset(layout: StripLayout, pxPerMs: number, offset: number): number {
  for (const p of layout.pieces) {
    if (offset < p.x) return p.range.startMs;
    if (offset <= p.x + p.width) {
      return Math.round(p.range.startMs + (offset - p.x) / pxPerMs);
    }
  }
  return layout.totalMs;
}

function touchDistance(evt: GestureResponderEvent): number {
  const [a, b] = evt.nativeEvent.touches;
  if (!a || !b) return 0;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

export const Timeline = memo(function Timeline(props: TimelineProps): JSX.Element {
  const {
    timeline,
    playhead,
    selectedPieceId,
    onSelectPiece,
    onScrubStart,
    onScrub,
    onScrubEnd,
    onTrimPreview,
    onTrimCommit,
    allMuted,
    onToggleAllMuted,
    cueSlots,
    selectedCue,
    onSelectCue,
    onCuePreview,
    onCueCommit,
  } = props;

  const laneH = cueLaneHeight(cueSlots);
  const contentH = CONTENT_H + laneH;
  const [width, setWidth] = useState(0);
  const [pxPerSec, setPxPerSec] = useState(DEFAULT_PX_PER_SEC);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const pxPerMs = pxPerSec / 1000;
  const layout = useMemo(() => buildLayout(timeline, pxPerMs), [timeline, pxPerMs]);

  const scrollRef = useRef<ScrollView>(null);
  const interactingRef = useRef(false);
  const momentumRef = useRef(false);
  const settleFrameRef = useRef<number | null>(null);
  const lastScrubAtRef = useRef(0);
  const offsetRef = useRef(0);
  const trimRef = useRef<{ pieceId: string; side: TrimSide; offset: number; endX: number } | null>(
    null,
  );
  const latest = useRef({
    layout,
    pxPerMs,
    onScrub,
    onScrubEnd,
    onScrubStart,
    onSelectPiece,
    onTrimPreview,
    onTrimCommit,
    onSelectCue,
    onCuePreview,
    onCueCommit,
  });
  useLayoutEffect(() => {
    latest.current = {
      layout,
      pxPerMs,
      onScrub,
      onScrubEnd,
      onScrubStart,
      onSelectPiece,
      onTrimPreview,
      onTrimCommit,
      onSelectCue,
      onCuePreview,
      onCueCommit,
    };
  });

  // Follow the playhead without a React render per tick.
  useEffect(() => {
    if (width <= 0) return;
    const follow = (ms: number) => {
      if (interactingRef.current) return;
      scrollRef.current?.scrollTo({ x: offsetForMs(layout, pxPerMs, ms), animated: false });
    };
    follow(playhead.get());
    return playhead.subscribe(follow);
  }, [playhead, width, layout, pxPerMs]);

  useEffect(() => {
    return () => {
      if (settleFrameRef.current !== null) cancelAnimationFrame(settleFrameRef.current);
    };
  }, []);

  const settle = useCallback((offset: number) => {
    interactingRef.current = false;
    momentumRef.current = false;
    const { layout: l, pxPerMs: k, onScrubEnd: end } = latest.current;
    end(msForOffset(l, k, offset));
  }, []);

  const handleScrollBegin = useCallback(() => {
    if (settleFrameRef.current !== null) {
      cancelAnimationFrame(settleFrameRef.current);
      settleFrameRef.current = null;
    }
    if (!interactingRef.current) {
      interactingRef.current = true;
      latest.current.onScrubStart();
    }
  }, []);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetRef.current = e.nativeEvent.contentOffset.x;
    if (!interactingRef.current || trimRef.current !== null) return;
    const now = Date.now();
    if (now - lastScrubAtRef.current < THROTTLE_MS) return;
    lastScrubAtRef.current = now;
    const { layout: l, pxPerMs: k, onScrub: scrub } = latest.current;
    scrub(msForOffset(l, k, e.nativeEvent.contentOffset.x));
  }, []);

  const handleScrollEndDrag = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offset = e.nativeEvent.contentOffset.x;
      momentumRef.current = false;
      settleFrameRef.current = requestAnimationFrame(() => {
        settleFrameRef.current = null;
        if (!momentumRef.current && interactingRef.current) settle(offset);
      });
    },
    [settle],
  );

  const handleMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (interactingRef.current) settle(e.nativeEvent.contentOffset.x);
    },
    [settle],
  );

  const endPinch = useEvent(() => {
    setScrollEnabled(true);
    latest.current.onScrubEnd(playhead.get());
  });
  const pinchPxPerSec = useEvent(() => latest.current.pxPerMs * 1000);
  const startPinch = useEvent(() => {
    setScrollEnabled(false);
    latest.current.onScrubStart();
  });
  const [pinch] = useState(() =>
    createPinchResponder({
      pxPerSec: pinchPxPerSec,
      onStart: startPinch,
      onZoom: setPxPerSec,
      onEnd: endPinch,
    }),
  );

  // Stable callbacks so memoised strips do not re-render on every playhead tick.
  const selectPiece = useCallback((pieceId: string | null) => {
    latest.current.onSelectPiece(pieceId);
  }, []);

  const trimPreview = useCallback((pieceId: string, edges: TrimEdges) => {
    latest.current.onTrimPreview(pieceId, edges);
  }, []);

  const beginCueDrag = useCallback(() => {
    interactingRef.current = true;
    setScrollEnabled(false);
    latest.current.onScrubStart();
  }, []);

  // A left trim keeps the piece's end still on screen (the strip scrolls
  // under the handle), so the handle itself is what moves with the finger.
  const beginTrim = useCallback((pieceId: string, side: TrimSide) => {
    interactingRef.current = true;
    setScrollEnabled(false);
    const hit = latest.current.layout.pieces.find((p) => p.range.piece.id === pieceId);
    trimRef.current = {
      pieceId,
      side,
      offset: offsetRef.current,
      endX: hit ? hit.x + hit.width : 0,
    };
    latest.current.onScrubStart();
  }, []);

  const endTrim = useCallback((pieceId: string, edges: TrimEdges) => {
    interactingRef.current = false;
    trimRef.current = null;
    setScrollEnabled(true);
    latest.current.onTrimCommit(pieceId, edges);
  }, []);

  useEffect(() => {
    const trim = trimRef.current;
    if (trim === null || trim.side !== 'left') return;
    const hit = layout.pieces.find((p) => p.range.piece.id === trim.pieceId);
    if (!hit) return;
    const offset = trim.offset + (hit.x + hit.width - trim.endX);
    scrollRef.current?.scrollTo({ x: offset, animated: false });
  }, [layout]);

  const snapSourceMs = useEvent((pieceId: string): number | null => {
    const hit = latest.current.layout.pieces.find((p) => p.range.piece.id === pieceId);
    if (!hit) return null;
    const t = playhead.get();
    if (t < hit.range.startMs || t > hit.range.endMs) return null;
    return hit.range.piece.inMs + (t - hit.range.startMs) * hit.range.piece.speed;
  });

  const selectCue = useCallback((selection: CueSelection) => {
    latest.current.onSelectCue(selection);
  }, []);

  const cuePreview = useCallback((drag: CueDrag) => {
    latest.current.onCuePreview(drag);
  }, []);

  const endCueDrag = useCallback((drag: CueDrag) => {
    interactingRef.current = false;
    setScrollEnabled(true);
    latest.current.onCueCommit(drag);
  }, []);

  const clearSelection = useCallback(() => selectPiece(null), [selectPiece]);
  const handleMomentumBegin = useCallback(() => {
    momentumRef.current = true;
  }, []);

  const cuePieces = useMemo(
    () => layout.pieces.map((p) => ({ piece: p.range.piece, x: p.x, width: p.width })),
    [layout],
  );

  const ready = width > 0;
  const pieceCount = layout.pieces.length;

  return (
    <View style={[styles.root, { height: TIMELINE_HEIGHT + laneH }]} {...pinch.panHandlers}>
      <View style={[styles.rail, { height: contentH, paddingTop: RULER_H + RULER_GAP + laneH }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={allMuted ? 'Unmute all clips' : 'Mute all clips'}
          onPress={onToggleAllMuted}
          hitSlop={8}
          style={styles.speaker}
        >
          <Icon name={allMuted ? 'volume-x' : 'volume-2'} size={18} color={color.whiteA60} />
        </Pressable>
      </View>
      <View
        style={[styles.scrollArea, { height: contentH }]}
        onLayout={(e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width))}
      >
        {ready ? (
          <ScrollView
            ref={scrollRef}
            horizontal
            scrollEnabled={scrollEnabled}
            scrollEventThrottle={16}
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            bounces={false}
            removeClippedSubviews
            onScrollBeginDrag={handleScrollBegin}
            onScroll={handleScroll}
            onScrollEndDrag={handleScrollEndDrag}
            onMomentumScrollBegin={handleMomentumBegin}
            onMomentumScrollEnd={handleMomentumEnd}
            contentContainerStyle={{ paddingHorizontal: width / 2 }}
          >
            <View style={{ width: layout.totalWidth, height: contentH }}>
              <Ruler layout={layout} pxPerSec={pxPerSec} />
              {laneH > 0 ? (
                <View style={[styles.cueLane, { height: laneH }]}>
                  <CueLane
                    slots={cueSlots}
                    pieces={cuePieces}
                    pxPerMs={pxPerMs}
                    showMediaRow={cueSlots.some((s) => s.hasMedia)}
                    selected={selectedCue}
                    onSelect={selectCue}
                    onDragStart={beginCueDrag}
                    onDragPreview={cuePreview}
                    onDragEnd={endCueDrag}
                  />
                </View>
              ) : null}
              <Pressable
                style={[styles.track, laneH > 0 && styles.trackAfterLane]}
                onPress={clearSelection}
              >
                {layout.pieces.map((p, i) => (
                  <PieceStrip
                    key={p.range.piece.id}
                    piece={p.range.piece}
                    index={i}
                    count={pieceCount}
                    x={p.x}
                    width={p.width}
                    pxPerMs={pxPerMs}
                    selected={p.range.piece.id === selectedPieceId}
                    snapSourceMs={snapSourceMs}
                    onSelectPiece={selectPiece}
                    onTrimStart={beginTrim}
                    onTrimPreview={trimPreview}
                    onTrimEnd={endTrim}
                  />
                ))}
              </Pressable>
            </View>
          </ScrollView>
        ) : null}
        {ready ? (
          <View
            pointerEvents="none"
            style={[styles.playhead, { left: width / 2 - 1, height: contentH }]}
          />
        ) : null}
      </View>
    </View>
  );
});

const Ruler = memo(function Ruler(props: { layout: StripLayout; pxPerSec: number }): JSX.Element {
  const { layout, pxPerSec } = props;
  const pxPerMs = pxPerSec / 1000;
  const stepMs = pxPerSec >= 120 ? 1000 : pxPerSec >= 48 ? 2000 : 5000;
  const marks: JSX.Element[] = [];
  for (let t = 0; t <= layout.totalMs; t += stepMs) {
    const x = offsetForMs(layout, pxPerMs, t);
    marks.push(
        <Text key={`l${t}`} style={[styles.rulerLabel, { left: x - LABEL_W / 2 }]}>
        {formatClock(t)}
      </Text>,
    );
    const mid = t + stepMs / 2;
    if (mid >= layout.totalMs) continue;
    const tickX = offsetForMs(layout, pxPerMs, mid);
    marks.push(<View key={`t${t}`} style={[styles.rulerTick, { left: tickX }]} />);
  }
  return <View style={styles.ruler}>{marks}</View>;
});

/** The poster frames inside one piece's source range, built once per zoom level. */
const FrameStrip = memo(function FrameStrip(props: {
  frames: string[];
  frameIntervalMs: number;
  inMs: number;
  outMs: number;
  speed: number;
  pxPerMs: number;
}): JSX.Element | null {
  const { frames, frameIntervalMs, inMs, outMs, speed, pxPerMs } = props;
  if (frames.length === 0) return null;
  const frameWidth = (frameIntervalMs / speed) * pxPerMs;
  const firstFrame = Math.floor(inMs / frameIntervalMs);
  const lastFrame = Math.ceil(outMs / frameIntervalMs);
  const shift = ((inMs % frameIntervalMs) / speed) * pxPerMs;
  const frameCount = Math.max(0, lastFrame - firstFrame);
  return (
    <View style={[styles.frameRow, { left: -shift }]} pointerEvents="none">
      {Array.from({ length: frameCount }, (_, k) => {
        const uri = frames[firstFrame + k] ?? '';
        return uri.length > 0 ? (
          <Image
            key={firstFrame + k}
            source={{ uri }}
            resizeMode="cover"
            fadeDuration={0}
            style={{ width: frameWidth, height: TRACK_H }}
          />
        ) : (
          <View key={firstFrame + k} style={[styles.frameEmpty, { width: frameWidth }]} />
        );
      })}
    </View>
  );
});

const PieceStrip = memo(function PieceStrip(props: {
  piece: EditPiece;
  index: number;
  count: number;
  x: number;
  width: number;
  pxPerMs: number;
  selected: boolean;
  snapSourceMs: (pieceId: string) => number | null;
  onSelectPiece: (pieceId: string | null) => void;
  onTrimStart: (pieceId: string, side: TrimSide) => void;
  onTrimPreview: (pieceId: string, edges: TrimEdges) => void;
  onTrimEnd: (pieceId: string, edges: TrimEdges) => void;
}): JSX.Element {
  const { piece, index, count, x, width, pxPerMs, selected, onSelectPiece } = props;
  const { frames, frameIntervalMs } = useClipFrames(piece.sourceUri, piece.sourceDurationMs);
  const durationMs = pieceDurationMs(piece);
  const toggleSelect = useCallback(
    () => onSelectPiece(selected ? null : piece.id),
    [onSelectPiece, selected, piece.id],
  );

  return (
    <View style={[styles.pieceWrap, { left: x, width }, selected && styles.pieceWrapSelected]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Clip ${index + 1} of ${count}, ${(durationMs / 1000).toFixed(1)} seconds`}
        accessibilityState={{ selected }}
        onPress={toggleSelect}
        style={[styles.piece, selected && styles.pieceSelected]}
      >
        <FrameStrip
          frames={frames}
          frameIntervalMs={frameIntervalMs}
          inMs={piece.inMs}
          outMs={piece.outMs}
          speed={piece.speed}
          pxPerMs={pxPerMs}
        />
        <View style={styles.badge} pointerEvents="none">
          <Text style={styles.badgeText}>{formatSeconds(durationMs)}</Text>
        </View>
        {piece.muted ? (
          <View style={styles.mutedBadge} pointerEvents="none">
            <Icon name="volume-x" size={11} color={color.white} />
          </View>
        ) : null}
      </Pressable>
      {selected
        ? (['left', 'right'] as const).map((side) => (
            <TrimHandle
              key={side}
              side={side}
              piece={piece}
              pxPerMs={pxPerMs}
              snapSourceMs={props.snapSourceMs}
              onTrimStart={props.onTrimStart}
              onTrimPreview={props.onTrimPreview}
              onTrimEnd={props.onTrimEnd}
            />
          ))
        : null}
    </View>
  );
});

/** Two finger zoom on the whole strip. Built once; reads live values through callbacks. */
function createPinchResponder(hooks: {
  pxPerSec: () => number;
  onStart: () => void;
  onZoom: (pxPerSec: number) => void;
  onEnd: () => void;
}): PanResponderInstance {
  let startDistance = 0;
  let startPxPerSec = DEFAULT_PX_PER_SEC;
  return PanResponder.create({
    onStartShouldSetPanResponderCapture: (evt) => evt.nativeEvent.touches.length >= 2,
    onMoveShouldSetPanResponderCapture: (evt) => evt.nativeEvent.touches.length >= 2,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (evt) => {
      startDistance = touchDistance(evt);
      startPxPerSec = hooks.pxPerSec();
      hooks.onStart();
    },
    onPanResponderMove: (evt) => {
      const distance = touchDistance(evt);
      if (startDistance <= 0 || distance <= 0) return;
      hooks.onZoom(
        clamp(startPxPerSec * (distance / startDistance), MIN_PX_PER_SEC, MAX_PX_PER_SEC),
      );
    },
    onPanResponderRelease: hooks.onEnd,
    onPanResponderTerminate: hooks.onEnd,
  });
}

type TrimSide = 'left' | 'right';

type TrimHandleProps = {
  side: TrimSide;
  piece: EditPiece;
  pxPerMs: number;
  /** Source ms of this piece under the playhead line, if it is inside the piece. */
  snapSourceMs: (pieceId: string) => number | null;
  onTrimStart: (pieceId: string, side: TrimSide) => void;
  onTrimPreview: (pieceId: string, edges: TrimEdges) => void;
  onTrimEnd: (pieceId: string, edges: TrimEdges) => void;
};

type TrimLive = {
  /** Finger position minus what the (throttled) layout has already applied. */
  translate: Animated.Value;
  setLabelMs: (ms: number | null) => void;
};

/** Px the committed layout has moved this handle since the grab. */
function appliedTrimPx(props: TrimHandleProps, origin: { inMs: number; outMs: number }): number {
  const { piece, side, pxPerMs } = props;
  const from = side === 'left' ? origin.inMs : origin.outMs;
  const to = side === 'left' ? piece.inMs : piece.outMs;
  return ((to - from) / piece.speed) * pxPerMs;
}

/**
 * Drag of one trim handle. Built once; `latest` returns the current props.
 * The handle follows the finger 1:1 on an Animated translate while the strip
 * layout catches up at the preview rate; the edge is clamped to the piece and
 * snaps to the playhead within SNAP_PX.
 */
function createTrimResponder(latest: () => TrimHandleProps, live: TrimLive) {
  let origin = { inMs: 0, outMs: 0 };
  let edges: TrimEdges = {};
  let targetPx = 0;
  let snapMs: number | null = null;
  let lastSent = { at: 0, inMs: -1, outMs: -1 };

  const syncTranslate = () => {
    live.translate.setValue(targetPx - appliedTrimPx(latest(), origin));
  };

  const finish = () => {
    const { piece, onTrimEnd } = latest();
    live.setLabelMs(null);
    targetPx = 0;
    live.translate.setValue(0);
    onTrimEnd(piece.id, edges);
  };

  const responder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      const { piece, side, onTrimStart, snapSourceMs } = latest();
      origin = { inMs: piece.inMs, outMs: piece.outMs };
      edges = {};
      targetPx = 0;
      snapMs = snapSourceMs(piece.id);
      lastSent = { at: 0, inMs: piece.inMs, outMs: piece.outMs };
      onTrimStart(piece.id, side);
    },
    onPanResponderMove: (_evt, gs) => {
      const props = latest();
      const { piece, pxPerMs, side, onTrimPreview } = props;
      if (pxPerMs <= 0) return;
      const from = side === 'left' ? origin.inMs : origin.outMs;
      let edgeMs = from + (gs.dx / pxPerMs) * piece.speed;
      if (snapMs !== null && Math.abs(((edgeMs - snapMs) / piece.speed) * pxPerMs) < SNAP_PX) {
        edgeMs = snapMs;
      }
      const wanted: TrimEdges =
        side === 'left' ? { inMs: Math.round(edgeMs) } : { outMs: Math.round(edgeMs) };
      const clamped = clampTrim({ ...piece, inMs: origin.inMs, outMs: origin.outMs }, wanted);
      const clampedEdge = side === 'left' ? clamped.inMs : clamped.outMs;
      edges = side === 'left' ? { inMs: clampedEdge } : { outMs: clampedEdge };
      targetPx = ((clampedEdge - from) / piece.speed) * pxPerMs;
      syncTranslate();

      const now = Date.now();
      if (now - lastSent.at < THROTTLE_MS) return;
      if (clamped.inMs === lastSent.inMs && clamped.outMs === lastSent.outMs) return;
      lastSent = { at: now, ...clamped };
      live.setLabelMs(clampedEdge);
      onTrimPreview(piece.id, edges);
    },
    onPanResponderRelease: finish,
    onPanResponderTerminate: finish,
  });

  return { panHandlers: responder.panHandlers, syncTranslate };
}

function TrimHandle(props: TrimHandleProps): JSX.Element {
  const { side, piece, pxPerMs } = props;
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  const getLatest = useEvent(() => latest.current);
  const [labelMs, setLabelMs] = useState<number | null>(null);
  const [translate] = useState(() => new Animated.Value(0));
  const [gesture] = useState(() => createTrimResponder(getLatest, { translate, setLabelMs }));

  // The layout caught up with the finger: shrink the residual offset.
  useEffect(() => {
    gesture.syncTranslate();
  }, [gesture, piece.inMs, piece.outMs, pxPerMs]);

  return (
    <Animated.View
      {...gesture.panHandlers}
      accessibilityRole="adjustable"
      accessibilityLabel={side === 'left' ? 'Trim start' : 'Trim end'}
      style={[
        styles.handle,
        side === 'left' ? styles.handleLeft : styles.handleRight,
        { transform: [{ translateX: translate }] },
      ]}
    >
      <Icon name={side === 'left' ? 'chevron-left' : 'chevron-right'} size={14} color={color.ink} />
      {labelMs !== null ? (
        <View style={[styles.trimLabel, side === 'left' ? styles.trimLabelLeft : styles.trimLabelRight]} pointerEvents="none">
          <Text style={styles.trimLabelText}>{formatSeconds(labelMs)}</Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    height: TIMELINE_HEIGHT,
    backgroundColor: '#000',
    flexDirection: 'row',
    paddingTop: PAD_TOP,
    paddingBottom: PAD_BOTTOM,
  },
  rail: { width: RAIL_W, height: CONTENT_H, paddingTop: RULER_H + RULER_GAP },
  speaker: { height: TRACK_H, alignItems: 'center', justifyContent: 'center' },
  scrollArea: { flex: 1, height: CONTENT_H },
  playhead: {
    position: 'absolute',
    top: 0,
    width: 2,
    height: CONTENT_H,
    borderRadius: 1,
    backgroundColor: color.white,
  },
  ruler: { height: RULER_H, width: '100%' },
  rulerLabel: {
    position: 'absolute',
    top: 2,
    width: LABEL_W,
    textAlign: 'center',
    fontSize: type.size.micro,
    lineHeight: 12,
    fontWeight: type.weight.medium,
    color: color.whiteA60,
    fontVariant: ['tabular-nums'],
  },
  rulerTick: { position: 'absolute', bottom: 2, width: 1, height: 4, backgroundColor: color.whiteA28 },
  cueLane: { marginTop: RULER_GAP, width: '100%', zIndex: 2 },
  track: { marginTop: RULER_GAP, height: TRACK_H, width: '100%' },
  trackAfterLane: { marginTop: 0 },
  pieceWrap: { position: 'absolute', top: 0, height: TRACK_H },
  pieceWrapSelected: { zIndex: 2 },
  piece: { flex: 1, borderRadius: PIECE_RADIUS, overflow: 'hidden', backgroundColor: color.ink800 },
  pieceSelected: { borderWidth: 2, borderColor: color.white },
  frameRow: { position: 'absolute', top: 0, height: TRACK_H, flexDirection: 'row' },
  frameEmpty: { height: TRACK_H, backgroundColor: '#2A2F36' },
  badge: {
    position: 'absolute',
    top: 4,
    left: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: color.inkA55,
  },
  badgeText: {
    fontSize: type.size.micro11,
    lineHeight: 14,
    fontWeight: type.weight.semibold,
    color: color.white,
    fontVariant: ['tabular-nums'],
  },
  mutedBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.inkA55,
  },
  handle: {
    position: 'absolute',
    top: 0,
    width: HANDLE_W,
    height: TRACK_H,
    zIndex: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.white,
  },
  trimLabel: {
    position: 'absolute',
    top: -22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: color.white,
  },
  trimLabelLeft: { left: 0 },
  trimLabelRight: { right: 0 },
  trimLabelText: {
    fontSize: type.size.micro11,
    lineHeight: 14,
    fontWeight: type.weight.semibold,
    color: color.ink,
    fontVariant: ['tabular-nums'],
  },
  handleLeft: { left: 0, borderTopLeftRadius: PIECE_RADIUS, borderBottomLeftRadius: PIECE_RADIUS },
  handleRight: { right: 0, borderTopRightRadius: PIECE_RADIUS, borderBottomRightRadius: PIECE_RADIUS },
});
