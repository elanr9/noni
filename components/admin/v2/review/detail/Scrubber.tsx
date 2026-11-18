import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { color, motion, radius } from '../../../../../theme/v2';
import { tap } from '../../../../v2';
import { clock } from './notes';

const TRACK = 'rgba(255,255,255,0.35)';
const DIM = 'rgba(255,255,255,0.6)';
const SHADOW = 'rgba(0,0,0,0.3)';

export interface ScrubberProps {
  time: number;
  duration: number;
  /** Seconds of pinned notes, drawn as amber markers. */
  markers: number[];
  onScrubStart: () => void;
  onSeek: (sec: number) => void;
  onScrubEnd: () => void;
  scrubbing: boolean;
}

/**
 * 32px hit area straddling the footer edge. 3px track that grows to 6 while
 * held, a knob and the "0:12 / 0:34" readout while scrubbing, amber markers
 * for pinned notes that seek on tap.
 */
export function Scrubber({ time, duration, markers, onScrubStart, onSeek, onScrubEnd, scrubbing }: ScrubberProps) {
  const [width, setWidth] = useState(0);
  const grow = useSharedValue(0);
  useEffect(() => {
    grow.set(withTiming(scrubbing ? 1 : 0, { duration: 120, easing: motion.ease }));
  }, [scrubbing, grow]);
  const track = useAnimatedStyle(() => ({ height: 3 + 3 * grow.get() }));
  const knob = useAnimatedStyle(() => ({ transform: [{ scale: grow.get() }], opacity: grow.get() }));

  const total = duration > 0 ? duration : 1;
  const frac = Math.min(1, Math.max(0, time / total));

  const seekAt = (x: number) => {
    if (width <= 0 || duration <= 0) return;
    onSeek(Math.max(0, Math.min(duration, (x / width) * duration)));
  };

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      runOnJS(onScrubStart)();
      runOnJS(seekAt)(e.x);
    })
    .onUpdate((e) => {
      runOnJS(seekAt)(e.x);
    })
    .onFinalize(() => {
      runOnJS(onScrubEnd)();
    });

  return (
    <View style={styles.hit} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {scrubbing ? (
        <Text style={styles.readout} pointerEvents="none">
          {clock(time)} <Text style={{ color: DIM }}>/ {clock(duration)}</Text>
        </Text>
      ) : null}
      <GestureDetector gesture={pan}>
        <View style={StyleSheet.absoluteFill} accessibilityRole="adjustable" accessibilityLabel="Seek" accessibilityValue={{ text: `${clock(time)} of ${clock(duration)}` }}>
          <Animated.View style={[styles.track, track]}>
            <View style={[styles.fill, { width: `${frac * 100}%` }]} />
          </Animated.View>
          <Animated.View pointerEvents="none" style={[styles.knob, { left: frac * width - 7 }, knob]} />
        </View>
      </GestureDetector>
      {duration > 0 && width > 0
        ? markers.map((at, i) => (
            <Pressable
              key={`${at}-${i}`}
              accessibilityRole="button"
              accessibilityLabel={`Jump to note at ${clock(at)}`}
              hitSlop={10}
              onPress={() => {
                tap();
                onSeek(at);
              }}
              style={[styles.marker, { left: (Math.min(at, duration) / duration) * width - 6 }]}
            />
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { height: 32, justifyContent: 'flex-end' },
  readout: { position: 'absolute', bottom: 36, alignSelf: 'center', fontSize: 15, lineHeight: 20, fontWeight: '700', color: color.white, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 3 },
  track: { position: 'absolute', left: 0, right: 0, bottom: 14, backgroundColor: TRACK, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: color.white },
  knob: { position: 'absolute', bottom: 10, width: 14, height: 14, borderRadius: radius.pill, backgroundColor: color.white, boxShadow: `0 1px 4px ${SHADOW}` },
  marker: { position: 'absolute', bottom: 11, width: 12, height: 12, borderRadius: radius.pill, backgroundColor: color.amber, borderWidth: 2, borderColor: color.white, boxShadow: `0 1px 3px ${SHADOW}` },
});
