// Recording chrome that ticks on its own: the elapsed clock re-renders only
// itself, the progress fill is one Animated timing, and the countdown pops
// each digit without the screen re-rendering.
import { useEffect, useRef, useState, type JSX } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { color, radius, type } from '../../../theme/tokens';

const COUNTDOWN_STEP_MS = 800;

export function formatClockMs(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Red dot plus m:ss since `startedAt`; owns its own 250ms tick. */
export function RecClock(props: { startedAt: number }): JSX.Element {
  const { startedAt } = props;
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsedMs(Date.now() - startedAt), 250);
    return () => clearInterval(t);
  }, [startedAt]);
  return (
    <View style={styles.recPill}>
      <View style={styles.recDot} />
      <Text style={styles.recPillText}>{formatClockMs(elapsedMs)}</Text>
    </View>
  );
}

/** Progress segment that fills from the left over `fillMs`, native driven. */
export function RecordingSegment(props: {
  running: boolean;
  fillMs: number;
  style?: object;
}): JSX.Element {
  const { running, fillMs, style } = props;
  const [progress] = useState(() => new Animated.Value(0));
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!running) {
      progress.setValue(0);
      return;
    }
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: fillMs,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [running, fillMs, progress]);

  return (
    <View
      style={[styles.track, style]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 ? (
        <Animated.View
          style={[
            styles.fill,
            {
              width,
              transform: [
                {
                  translateX: Animated.multiply(
                    Animated.subtract(progress, 1),
                    width / 2,
                  ),
                },
                { scaleX: progress },
              ],
            },
          ]}
        />
      ) : null}
    </View>
  );
}

/** 3, 2, 1 with a pop per digit; `onDone` fires once after the last step. */
export function Countdown(props: { onDone: () => void; onCancel: () => void }): JSX.Element {
  const { onDone, onCancel } = props;
  const [count, setCount] = useState(3);
  const [pop] = useState(() => new Animated.Value(0));
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    pop.setValue(0);
    Animated.spring(pop, {
      toValue: 1,
      speed: 30,
      bounciness: 8,
      useNativeDriver: true,
    }).start();
    const t = setTimeout(() => {
      if (count > 1) setCount(count - 1);
      else doneRef.current();
    }, COUNTDOWN_STEP_MS);
    return () => clearTimeout(t);
  }, [count, pop]);

  return (
    <Pressable
      style={styles.countdownWrap}
      onPress={onCancel}
      accessibilityRole="button"
      accessibilityLabel={`Recording in ${count}. Tap to cancel.`}
    >
      <Animated.Text
        style={[
          styles.countdown,
          {
            opacity: pop,
            transform: [
              {
                scale: pop.interpolate({ inputRange: [0, 1], outputRange: [1.6, 1] }),
              },
            ],
          },
        ]}
      >
        {count}
      </Animated.Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  recPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: color.inkA55,
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: color.danger,
  },
  recPillText: {
    color: color.white,
    fontSize: type.size.label,
    fontWeight: type.weight.heavy,
    fontVariant: ['tabular-nums'],
  },
  track: {
    flex: 1,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA28,
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: color.accent,
  },
  countdownWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.scrim,
    zIndex: 6,
  },
  countdown: {
    color: color.white,
    fontSize: 96,
    fontWeight: type.weight.heavy,
    fontVariant: ['tabular-nums'],
  },
});
