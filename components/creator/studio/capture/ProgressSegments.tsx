import { useEffect, useState, type JSX } from 'react';
import { StyleSheet, View } from 'react-native';

import { color, radius } from '../../../../theme/tokens';
import { WHITE } from './constants';

const TICK_GAP = 2;
const SCALE_STEPS_MS = [15_000, 30_000, 60_000, 180_000];

export type ProgressSegmentsProps = {
  clipCount: number;
  totalMs: number;
  /** Durations of clips captured this session, oldest first, aligned to the end of the list. */
  knownDurations: number[];
  /** Wall-clock start of the live recording, null when idle. */
  recordingStartedAt: number | null;
};

/** The bar spans a fixed window that steps up as the post grows. */
export function barScaleMs(ms: number): number {
  for (const step of SCALE_STEPS_MS) if (ms <= step) return step;
  return Math.ceil(ms / 60_000) * 60_000;
}

/** Per-clip lengths; clips from before this session share the remaining time equally. */
export function segmentDurations(clipCount: number, totalMs: number, known: number[]): number[] {
  const recent = known.slice(Math.max(0, known.length - clipCount));
  const unknownCount = clipCount - recent.length;
  if (unknownCount <= 0) return recent;
  const knownSum = recent.reduce((sum, d) => sum + d, 0);
  const share = Math.max(0, totalMs - knownSum) / unknownCount;
  return [...Array<number>(unknownCount).fill(share), ...recent];
}

type Bar = { key: string; left: number; width: number; live: boolean };

function layoutBars(segments: number[], liveMs: number, scale: number): Bar[] {
  const bars: Bar[] = [];
  let cursor = 0;
  segments.forEach((ms, i) => {
    bars.push({ key: `s${i}`, left: cursor / scale, width: ms / scale, live: false });
    cursor += ms;
  });
  if (liveMs > 0) bars.push({ key: 'live', left: cursor / scale, width: liveMs / scale, live: true });
  return bars;
}

export function ProgressSegments({ clipCount, totalMs, knownDurations, recordingStartedAt }: ProgressSegmentsProps): JSX.Element {
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (recordingStartedAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [recordingStartedAt]);

  const liveMs = recordingStartedAt === null ? 0 : Math.max(0, now - recordingStartedAt);
  const segments = segmentDurations(clipCount, totalMs, knownDurations);
  const scale = barScaleMs(totalMs + liveMs);
  const blocks = layoutBars(segments, liveMs, scale);

  return (
    <View style={styles.track} accessibilityLabel={`${clipCount} clips recorded`}>
      {blocks.map((b) => (
        <View
          key={b.key}
          style={[
            styles.block,
            b.live ? styles.blockLive : null,
            { left: `${b.left * 100}%`, width: `${Math.max(0, b.width * 100)}%` },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA28,
    overflow: 'hidden',
  },
  block: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: WHITE,
    borderRightWidth: TICK_GAP,
    borderRightColor: color.ink900,
  },
  blockLive: {
    backgroundColor: color.accent,
    borderRightWidth: 0,
  },
});
