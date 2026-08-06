import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { color } from '../theme/tokens';

type Props = {
  text: string;
  running: boolean;
  paused: boolean;
  speed: number;
  resetKey: number;
  onTap?: () => void;
  speedLabel?: string;
};

/** One word advances every 250/speed ms (README §5). */
const MS_PER_WORD = 250;

export function Teleprompter({
  text,
  running,
  paused,
  speed,
  resetKey,
  onTap,
  speedLabel,
}: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const contentHeight = useRef(0);
  const viewportHeight = useRef(0);

  useEffect(() => {
    setIndex(0);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [text, resetKey]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setIndex((i) => Math.min(i + 1, words.length - 1));
    }, MS_PER_WORD / speed);
    return () => clearInterval(timer);
  }, [running, speed, words.length]);

  useEffect(() => {
    if (words.length === 0) return;
    const overflow = contentHeight.current - viewportHeight.current;
    if (overflow <= 0) return;
    const fraction = index / Math.max(words.length - 1, 1);
    scrollRef.current?.scrollTo({ y: fraction * overflow, animated: true });
  }, [index, words.length]);

  return (
    <Pressable
      style={[styles.wrap, { height: Math.max(windowHeight * 0.34, 160) }]}
      onPress={onTap}
    >
      <ScrollView
        ref={scrollRef}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        pointerEvents="none"
        onContentSizeChange={(_w, h) => {
          contentHeight.current = h;
        }}
        onLayout={(e) => {
          viewportHeight.current = e.nativeEvent.layout.height;
        }}
      >
        <Text style={styles.line}>
          {words.map((word, i) => (
            <Text
              key={`${i}-${word}`}
              style={
                i < index
                  ? styles.spoken
                  : i === index
                    ? styles.current
                    : styles.upcoming
              }
            >
              {word}
              {i < words.length - 1 ? ' ' : ''}
            </Text>
          ))}
        </Text>
      </ScrollView>
      {speedLabel ? (
        <View style={styles.speedChip}>
          <Text style={styles.speedText}>{speedLabel}</Text>
        </View>
      ) : null}
      {paused ? (
        <View style={styles.pausedChip}>
          <Text style={styles.pausedText}>Script paused. Tap to resume.</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * Static beats view for video briefs with talking points (script_mode beats):
 * the creator's credential line, the chosen hook in full, then the numbered
 * points, all on screen at once. No scrolling prose; the creator talks, they
 * do not recite. activeIndex highlights the segment being recorded
 * (0 = hook, then one per point).
 */
export function BeatsPrompter({
  credential,
  hook,
  points,
  activeIndex,
}: {
  credential: string | null;
  hook: string;
  points: string[];
  activeIndex: number;
}) {
  const hasHook = hook.trim().length > 0;
  return (
    <View style={beatsStyles.wrap}>
      {credential?.trim() ? (
        <Text style={beatsStyles.credential}>{credential.trim()}</Text>
      ) : null}
      {hasHook ? (
        <Text
          style={[beatsStyles.hook, activeIndex === 0 && beatsStyles.active]}
        >
          {hook.trim()}
        </Text>
      ) : null}
      {points.map((point, i) => {
        const index = hasHook ? i + 1 : i;
        return (
          <Text
            key={`${i}-${point.slice(0, 16)}`}
            style={[beatsStyles.point, activeIndex === index && beatsStyles.active]}
          >
            {i + 1}. {point}
          </Text>
        );
      })}
    </View>
  );
}

const beatsStyles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 8,
    backgroundColor: color.scrim,
  },
  credential: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  hook: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.85)',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  point: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  active: { color: color.accentTint },
});

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: color.scrim,
  },
  line: {
    fontSize: 26,
    lineHeight: 38,
    fontWeight: '600',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  spoken: { color: 'rgba(255,255,255,0.45)' },
  current: { color: color.accentTint, fontWeight: '800' },
  upcoming: { color: '#FFFFFF' },
  speedChip: {
    position: 'absolute',
    top: 12,
    right: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,32,0.55)',
  },
  speedText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  pausedChip: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  pausedText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
});
