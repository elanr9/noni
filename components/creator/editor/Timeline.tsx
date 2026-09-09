// TikTok style timeline strip. Fully controlled: the parent owns the edit
// model and the player position; this component only reports scrub, trim,
// select and zoom gestures. The strip scrolls under a fixed centre playhead,
// so scroll offset and timeline time are the same axis (minus piece gaps).
import { memo, useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import {
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
import { useClipFrames } from './useClipFrames';

export type TrimEdges = { inMs?: number; outMs?: number };

export type TimelineProps = {
  timeline: EditTimeline;
  /** Playhead position in timeline ms, owned by the parent (player time). */
  positionMs: number;
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
};

const RAIL_W = 44;
const RULER_H = 22;
const RULER_GAP = 8;
const TRACK_H = 56;
const PAD_TOP = 12;
const PAD_BOTTOM = 16;
const CONTENT_H = RULER_H + RULER_GAP + TRACK_H;
export const TIMELINE_HEIGHT = PAD_TOP + CONTENT_H + PAD_BOTTOM;

const PIECE_RADIUS = 8;
const HANDLE_W = 22;
const SAME_SLOT_GAP = 2;
const SLOT_GAP = 6;
const MIN_PX_PER_SEC = 24;
const MAX_PX_PER_SEC = 320;
const DEFAULT_PX_PER_SEC = 56;
const THROTTLE_MS = 33;
const LABEL_W = 44;

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

export function Timeline(props: TimelineProps): JSX.Element {
  const {
    timeline,
    positionMs,
    selectedPieceId,
    onSelectPiece,
    onScrubStart,
    onScrub,
    onScrubEnd,
    onTrimPreview,
    onTrimCommit,
    allMuted,
    onToggleAllMuted,
  } = props;

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
  const latest = useRef({
    layout,
    pxPerMs,
    positionMs,
    onScrub,
    onScrubEnd,
    onScrubStart,
    onSelectPiece,
    onTrimPreview,
    onTrimCommit,
  });
  latest.current = {
    layout,
    pxPerMs,
    positionMs,
    onScrub,
    onScrubEnd,
    onScrubStart,
    onSelectPiece,
    onTrimPreview,
    onTrimCommit,
  };

  useEffect(() => {
    if (width <= 0 || interactingRef.current) return;
    scrollRef.current?.scrollTo({ x: offsetForMs(layout, pxPerMs, positionMs), animated: false });
  }, [width, layout, pxPerMs, positionMs]);

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
    if (!interactingRef.current) return;
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

  const pinchRef = useRef({ startDistance: 0, startPxPerSec: DEFAULT_PX_PER_SEC });
  const endPinch = useCallback(() => {
    setScrollEnabled(true);
    latest.current.onScrubEnd(latest.current.positionMs);
  }, []);
  const pinch = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: (evt) => evt.nativeEvent.touches.length >= 2,
      onMoveShouldSetPanResponderCapture: (evt) => evt.nativeEvent.touches.length >= 2,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        pinchRef.current = {
          startDistance: touchDistance(evt),
          startPxPerSec: latest.current.pxPerMs * 1000,
        };
        setScrollEnabled(false);
        latest.current.onScrubStart();
      },
      onPanResponderMove: (evt) => {
        const { startDistance, startPxPerSec } = pinchRef.current;
        const distance = touchDistance(evt);
        if (startDistance <= 0 || distance <= 0) return;
        setPxPerSec(clamp(startPxPerSec * (distance / startDistance), MIN_PX_PER_SEC, MAX_PX_PER_SEC));
      },
      onPanResponderRelease: endPinch,
      onPanResponderTerminate: endPinch,
    }),
  ).current;

  // Stable callbacks so memoised strips do not re-render on every playhead tick.
  const selectPiece = useCallback((pieceId: string | null) => {
    latest.current.onSelectPiece(pieceId);
  }, []);

  const trimPreview = useCallback((pieceId: string, edges: TrimEdges) => {
    latest.current.onTrimPreview(pieceId, edges);
  }, []);

  const beginTrim = useCallback(() => {
    interactingRef.current = true;
    setScrollEnabled(false);
    latest.current.onScrubStart();
  }, []);

  const endTrim = useCallback((pieceId: string, edges: TrimEdges) => {
    interactingRef.current = false;
    setScrollEnabled(true);
    latest.current.onTrimCommit(pieceId, edges);
  }, []);

  const ready = width > 0;
  const pieceCount = layout.pieces.length;

  return (
    <View style={styles.root} {...pinch.panHandlers}>
      <View style={styles.rail}>
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
        style={styles.scrollArea}
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
            onScrollBeginDrag={handleScrollBegin}
            onScroll={handleScroll}
            onScrollEndDrag={handleScrollEndDrag}
            onMomentumScrollBegin={() => {
              momentumRef.current = true;
            }}
            onMomentumScrollEnd={handleMomentumEnd}
            contentContainerStyle={{ paddingHorizontal: width / 2 }}
          >
            <View style={{ width: layout.totalWidth, height: CONTENT_H }}>
              <Ruler layout={layout} pxPerSec={pxPerSec} />
              <Pressable style={styles.track} onPress={() => selectPiece(null)}>
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
          <View pointerEvents="none" style={[styles.playhead, { left: width / 2 - 1 }]} />
        ) : null}
      </View>
    </View>
  );
}

function Ruler(props: { layout: StripLayout; pxPerSec: number }): JSX.Element {
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
}

const PieceStrip = memo(function PieceStrip(props: {
  piece: EditPiece;
  index: number;
  count: number;
  x: number;
  width: number;
  pxPerMs: number;
  selected: boolean;
  onSelectPiece: (pieceId: string | null) => void;
  onTrimStart: () => void;
  onTrimPreview: (pieceId: string, edges: TrimEdges) => void;
  onTrimEnd: (pieceId: string, edges: TrimEdges) => void;
}): JSX.Element {
  const { piece, index, count, x, width, pxPerMs, selected, onSelectPiece } = props;
  const { frames, frameIntervalMs } = useClipFrames(piece.sourceUri, piece.sourceDurationMs);
  const durationMs = pieceDurationMs(piece);

  const frameWidth = (frameIntervalMs / piece.speed) * pxPerMs;
  const firstFrame = Math.floor(piece.inMs / frameIntervalMs);
  const lastFrame = Math.ceil(piece.outMs / frameIntervalMs);
  const shift = ((piece.inMs % frameIntervalMs) / piece.speed) * pxPerMs;
  const frameCount = Math.max(0, lastFrame - firstFrame);

  return (
    <View style={[styles.pieceWrap, { left: x, width }, selected && styles.pieceWrapSelected]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Clip ${index + 1} of ${count}, ${(durationMs / 1000).toFixed(1)} seconds`}
        accessibilityState={{ selected }}
        onPress={() => onSelectPiece(selected ? null : piece.id)}
        style={[styles.piece, selected && styles.pieceSelected]}
      >
        {frames.length > 0 ? (
          <View style={[styles.frameRow, { left: -shift }]}>
            {Array.from({ length: frameCount }, (_, k) => {
              const uri = frames[firstFrame + k] ?? '';
              return uri.length > 0 ? (
                <Image
                  key={k}
                  source={{ uri }}
                  resizeMode="cover"
                  style={{ width: frameWidth, height: TRACK_H }}
                />
              ) : (
                <View key={k} style={[styles.frameEmpty, { width: frameWidth }]} />
              );
            })}
          </View>
        ) : null}
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
              onTrimStart={props.onTrimStart}
              onTrimPreview={props.onTrimPreview}
              onTrimEnd={props.onTrimEnd}
            />
          ))
        : null}
    </View>
  );
});

function TrimHandle(props: {
  side: 'left' | 'right';
  piece: EditPiece;
  pxPerMs: number;
  onTrimStart: () => void;
  onTrimPreview: (pieceId: string, edges: TrimEdges) => void;
  onTrimEnd: (pieceId: string, edges: TrimEdges) => void;
}): JSX.Element {
  const { side } = props;
  const latest = useRef(props);
  latest.current = props;
  const originRef = useRef({ inMs: 0, outMs: 0 });
  const edgesRef = useRef<TrimEdges>({});
  const lastSentRef = useRef({ at: 0, inMs: -1, outMs: -1 });
  const finish = useCallback(() => {
    latest.current.onTrimEnd(latest.current.piece.id, edgesRef.current);
  }, []);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        const { piece } = latest.current;
        originRef.current = { inMs: piece.inMs, outMs: piece.outMs };
        edgesRef.current = {};
        lastSentRef.current = { at: 0, inMs: piece.inMs, outMs: piece.outMs };
        latest.current.onTrimStart();
      },
      onPanResponderMove: (_evt, gs) => {
        const { piece, pxPerMs, side: s, onTrimPreview } = latest.current;
        if (pxPerMs <= 0) return;
        const delta = (gs.dx / pxPerMs) * piece.speed;
        const edges: TrimEdges =
          s === 'left'
            ? { inMs: Math.round(originRef.current.inMs + delta) }
            : { outMs: Math.round(originRef.current.outMs + delta) };
        edgesRef.current = edges;
        const now = Date.now();
        const last = lastSentRef.current;
        if (now - last.at < THROTTLE_MS) return;
        const clamped = clampTrim(piece, edges);
        if (clamped.inMs === last.inMs && clamped.outMs === last.outMs) return;
        lastSentRef.current = { at: now, ...clamped };
        onTrimPreview(piece.id, edges);
      },
      onPanResponderRelease: finish,
      onPanResponderTerminate: finish,
    }),
  ).current;

  return (
    <View
      {...pan.panHandlers}
      accessibilityRole="adjustable"
      accessibilityLabel={side === 'left' ? 'Trim start' : 'Trim end'}
      style={[styles.handle, side === 'left' ? styles.handleLeft : styles.handleRight]}
    >
      <Icon name={side === 'left' ? 'chevron-left' : 'chevron-right'} size={14} color={color.ink} />
    </View>
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
  track: { marginTop: RULER_GAP, height: TRACK_H, width: '100%' },
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
  handleLeft: { left: 0, borderTopLeftRadius: PIECE_RADIUS, borderBottomLeftRadius: PIECE_RADIUS },
  handleRight: { right: 0, borderTopRightRadius: PIECE_RADIUS, borderBottomRightRadius: PIECE_RADIUS },
});
