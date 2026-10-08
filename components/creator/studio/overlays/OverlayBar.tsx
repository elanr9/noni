// One overlay's bar in the timeline lane. Drag the body to move it in time,
// drag either end to change when it starts or stops, tap to select it and
// park the playhead on it.
// Gesture callbacks are built during render and read refs when they fire;
// the React Compiler rule cannot tell those apart from render-time reads.
/* eslint-disable react-hooks/refs */
import { memo, useLayoutEffect, useRef, type JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import {
  MIN_OVERLAY_MS,
  updateOverlay,
  type Overlay,
} from '../../../../lib/edit-document';
import { useStudioStore } from '../../../../lib/studio-store';
import { color, type } from '../../../../theme/tokens';
import { Icon } from '../../../ui/Icon';
import { beginGesture, endGesture, selectOverlay, updateGesture } from './overlay-actions';

export const BAR_HEIGHT = 26;
const HANDLE_WIDTH = 12;
const MIN_LABEL_WIDTH = 40;
const TEXT_TINT = '#1E88F5';
const IMAGE_TINT = '#8A4DFF';

export type OverlayBarProps = {
  overlay: Overlay;
  left: number;
  width: number;
  top: number;
  msPerPx: number;
  totalMs: number;
  selected: boolean;
};

type TimeWindow = { startMs: number; endMs: number };

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function useTimeDrag(
  overlay: Overlay,
  msPerPx: number,
  compute: (base: TimeWindow, deltaMs: number) => TimeWindow,
) {
  const base = useRef<TimeWindow>({ startMs: overlay.startMs, endMs: overlay.endMs });
  const latest = useRef({ overlay, msPerPx, compute });
  useLayoutEffect(() => {
    latest.current = { overlay, msPerPx, compute };
  });
  return Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-6, 6])
    .onStart(() => {
      base.current = { startMs: latest.current.overlay.startMs, endMs: latest.current.overlay.endMs };
      beginGesture();
    })
    .onUpdate((e) => {
      const { overlay: o, msPerPx: scale, compute: fn } = latest.current;
      const next = fn(base.current, Math.round(e.translationX * scale));
      if (next.startMs === o.startMs && next.endMs === o.endMs) return;
      updateGesture((doc) => updateOverlay(doc, o.id, next));
    })
    .onEnd(() => endGesture());
}

export const OverlayBar = memo(function OverlayBar(props: OverlayBarProps): JSX.Element {
  const { overlay, left, width, top, msPerPx, totalMs, selected } = props;

  const moveGesture = useTimeDrag(overlay, msPerPx, (base, delta) => {
    const duration = base.endMs - base.startMs;
    const startMs = clamp(base.startMs + delta, 0, Math.max(0, totalMs - duration));
    return { startMs, endMs: startMs + duration };
  });
  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((_e, success) => {
      if (!success) return;
      selectOverlay(overlay.id);
      useStudioStore.getState().setPlayhead(overlay.startMs);
    });
  const body = Gesture.Race(moveGesture, tap);

  const startGesture = useTimeDrag(overlay, msPerPx, (base, delta) => ({
    startMs: clamp(base.startMs + delta, 0, base.endMs - MIN_OVERLAY_MS),
    endMs: base.endMs,
  }));
  const endGestureHandle = useTimeDrag(overlay, msPerPx, (base, delta) => ({
    startMs: base.startMs,
    endMs: clamp(base.endMs + delta, base.startMs + MIN_OVERLAY_MS, totalMs),
  }));

  const tint = overlay.kind === 'text' ? TEXT_TINT : IMAGE_TINT;
  const label = overlay.kind === 'text' ? overlay.text.trim() || 'Text' : 'Picture';

  return (
    <View style={[styles.bar, { left, width, top, backgroundColor: tint }, selected && styles.barSelected]}>
      <GestureDetector gesture={body}>
        <View
          style={styles.body}
          accessibilityRole="button"
          accessibilityLabel={`${label} from ${Math.round(overlay.startMs / 100) / 10} seconds`}
          accessibilityState={{ selected }}
        >
          {overlay.kind === 'image' ? <Icon name="image" size={12} color={color.white} /> : null}
          {width >= MIN_LABEL_WIDTH ? (
            <Text style={styles.label} numberOfLines={1}>
              {label}
            </Text>
          ) : null}
        </View>
      </GestureDetector>
      {selected ? (
        <>
          <GestureDetector gesture={startGesture}>
            <View style={[styles.handle, styles.handleStart]} accessibilityLabel="Start handle">
              <View style={styles.grip} />
            </View>
          </GestureDetector>
          <GestureDetector gesture={endGestureHandle}>
            <View style={[styles.handle, styles.handleEnd]} accessibilityLabel="End handle">
              <View style={styles.grip} />
            </View>
          </GestureDetector>
        </>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    height: BAR_HEIGHT,
    borderRadius: 7,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  barSelected: {
    borderColor: color.white,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
  },
  label: {
    flex: 1,
    color: color.white,
    fontSize: type.size.micro11,
    fontWeight: '700',
  },
  handle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: HANDLE_WIDTH,
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleStart: {
    left: 0,
  },
  handleEnd: {
    right: 0,
  },
  grip: {
    width: 2,
    height: 10,
    borderRadius: 1,
    backgroundColor: color.ink900,
  },
});
