// The scrolling strip: ruler, one BlockStrip per block, the overlay lane on
// the same scale, all moving under a fixed centre playhead. Scroll offset
// and time are one axis (x = ms / msPerPx), so dragging the strip scrubs.
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { documentDurationMs, moveBlock, type VideoDocument } from '../../../../lib/edit-document';
import { onVideo, useStudioStore } from '../../../../lib/studio-store';
import { useEvent } from '../../editor/useEvent';
import { BlockStrip } from './BlockStrip';
import { clamp } from './geometry';
import { RULER_GAP, TRACK_H, stripItems } from './layout';
import { PlayheadLine } from './PlayheadLine';
import { Ruler } from './Ruler';
import { msToPx, pxToMs, useTimelineScale } from './scale';
import type { TrimStartInfo } from './TrimHandles';

const THROTTLE_MS = 33;
const LANE_GAP_TOP = 6;

type TrimState = TrimStartInfo & { offset0: number; endX0: number };

export function TimelineStrip(props: { doc: VideoDocument; overlayLane?: ReactNode }): JSX.Element {
  const { doc, overlayLane } = props;
  const msPerPx = useTimelineScale((s) => s.msPerPx);
  const setMsPerPx = useTimelineScale((s) => s.setMsPerPx);
  const setScrollOffsetMs = useTimelineScale((s) => s.setScrollOffsetMs);
  const selection = useStudioStore((s) => s.selection);

  const [width, setWidth] = useState(0);
  const [contentH, setContentH] = useState(TRACK_H);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const items = useMemo(() => stripItems(doc, msPerPx), [doc, msPerPx]);
  const totalMs = documentDurationMs(doc);
  const totalWidth = msToPx(totalMs, msPerPx);

  const scrollRef = useRef<ScrollView>(null);
  const interacting = useRef(false);
  const momentum = useRef(false);
  const offsetRef = useRef(0);
  const lastScrubAt = useRef(0);
  const trimRef = useRef<TrimState | null>(null);
  const pinchStart = useRef(0);
  const latest = useRef({ msPerPx, totalMs, width, items });
  useLayoutEffect(() => {
    latest.current = { msPerPx, totalMs, width, items };
  });

  const scrollGesture = useMemo(() => Gesture.Native(), []);

  const scrollToMs = useCallback((ms: number) => {
    scrollRef.current?.scrollTo({ x: msToPx(ms, latest.current.msPerPx), animated: false });
  }, []);

  useEffect(() => {
    if (width <= 0) return;
    const follow = (ms: number) => {
      if (!interacting.current) scrollToMs(ms);
    };
    follow(useStudioStore.getState().playheadMs);
    return useStudioStore.subscribe((state, prev) => {
      if (state.playheadMs !== prev.playheadMs) follow(state.playheadMs);
    });
  }, [width, msPerPx, scrollToMs]);

  // A start trim keeps the block's end still on screen so the handle under
  // the finger is what appears to move.
  useEffect(() => {
    const trim = trimRef.current;
    if (!trim || trim.edge !== 'in') return;
    const hit = items.find((i) => i.range.block.id === trim.blockId);
    if (!hit) return;
    scrollRef.current?.scrollTo({ x: trim.offset0 + (hit.x + hit.width - trim.endX0), animated: false });
  }, [items]);

  const msForOffset = (offset: number) =>
    clamp(Math.round(pxToMs(offset, latest.current.msPerPx)), 0, latest.current.totalMs);

  const handleScrollBegin = () => {
    if (!interacting.current) {
      interacting.current = true;
      useStudioStore.getState().setPlaying(false);
    }
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = e.nativeEvent.contentOffset.x;
    offsetRef.current = offset;
    const now = Date.now();
    if (now - lastScrubAt.current < THROTTLE_MS) return;
    lastScrubAt.current = now;
    setScrollOffsetMs(pxToMs(offset - latest.current.width / 2, latest.current.msPerPx));
    if (!interacting.current || trimRef.current !== null) return;
    useStudioStore.getState().setPlayhead(msForOffset(offset));
  };

  const settle = (offset: number) => {
    interacting.current = false;
    momentum.current = false;
    useStudioStore.getState().setPlayhead(msForOffset(offset));
  };

  const handleScrollEndDrag = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = e.nativeEvent.contentOffset.x;
    momentum.current = false;
    requestAnimationFrame(() => {
      if (!momentum.current && interacting.current && trimRef.current === null) settle(offset);
    });
  };

  const handleMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (interacting.current && trimRef.current === null) settle(e.nativeEvent.contentOffset.x);
  };

  const beginEdit = useCallback(() => {
    interacting.current = true;
    setScrollEnabled(false);
    useStudioStore.getState().setPlaying(false);
  }, []);

  const endEdit = useCallback(() => {
    interacting.current = false;
    trimRef.current = null;
    setScrollEnabled(true);
    scrollToMs(useStudioStore.getState().playheadMs);
  }, [scrollToMs]);

  const onTrimStart = useCallback(
    (info: TrimStartInfo) => {
      beginEdit();
      const hit = latest.current.items.find((i) => i.range.block.id === info.blockId);
      trimRef.current = { ...info, offset0: offsetRef.current, endX0: hit ? hit.x + hit.width : 0 };
    },
    [beginEdit],
  );

  const onReorderEnd = useCallback(
    (blockId: string, centerX: number) => {
      const list = latest.current.items;
      const hit = list.findIndex((i) => centerX >= i.x && centerX < i.x + i.width);
      const to = hit >= 0 ? hit : centerX < 0 ? 0 : list.length - 1;
      useStudioStore.getState().commit(onVideo((d) => moveBlock(d, blockId, to)));
      endEdit();
    },
    [endEdit],
  );

  const onPinchStart = useEvent(() => {
    pinchStart.current = useTimelineScale.getState().msPerPx;
    setScrollEnabled(false);
    useStudioStore.getState().setPlaying(false);
  });
  const onPinchUpdate = useEvent((scale: number) => {
    if (scale > 0) setMsPerPx(pinchStart.current / scale);
  });
  const onPinchEnd = useEvent(() => setScrollEnabled(true));

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .simultaneousWithExternalGesture(scrollGesture)
        .onStart(onPinchStart)
        .onUpdate((e) => onPinchUpdate(e.scale))
        .onFinalize(onPinchEnd),
    [scrollGesture, onPinchStart, onPinchUpdate, onPinchEnd],
  );

  const clearSelection = () => useStudioStore.getState().select(null);
  const selectedBlockId = selection?.kind === 'block' ? selection.blockId : null;
  const selectedCellIndex = selection?.kind === 'block' ? selection.cellIndex : 0;

  return (
    <GestureDetector gesture={pinch}>
      <View
        style={styles.root}
        onLayout={(e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width))}
      >
        {width > 0 ? (
          <GestureDetector gesture={scrollGesture}>
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
                momentum.current = true;
              }}
              onMomentumScrollEnd={handleMomentumEnd}
              contentContainerStyle={{ paddingHorizontal: width / 2 }}
            >
              <View
                style={{ width: Math.max(totalWidth, 1) }}
                onLayout={(e: LayoutChangeEvent) => setContentH(Math.round(e.nativeEvent.layout.height))}
              >
                <Ruler totalMs={totalMs} msPerPx={msPerPx} />
                <Pressable style={styles.track} onPress={clearSelection}>
                  {items.map((item, i) => (
                    <BlockStrip
                      key={item.range.block.id}
                      item={item}
                      doc={doc}
                      index={i}
                      count={items.length}
                      msPerPx={msPerPx}
                      selectedCell={item.range.block.id === selectedBlockId ? selectedCellIndex : null}
                      scrollGesture={scrollGesture}
                      onTrimStart={onTrimStart}
                      onTrimEnd={endEdit}
                      onReorderStart={beginEdit}
                      onReorderEnd={onReorderEnd}
                    />
                  ))}
                </Pressable>
                {overlayLane ? <View style={styles.lane}>{overlayLane}</View> : null}
              </View>
            </ScrollView>
          </GestureDetector>
        ) : null}
        {width > 0 ? <PlayheadLine x={width / 2} height={contentH} /> : null}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%' },
  track: { marginTop: RULER_GAP, height: TRACK_H, width: '100%' },
  lane: { marginTop: LANE_GAP_TOP, width: '100%' },
});
