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
      {paused ? (
        <View style={styles.pausedChip}>
          <Text style={styles.pausedText}>Script paused. Tap to resume.</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * Per-clip beat view for point clips: one talking point, large, on screen
 * for the whole take. The creator talks around the beat, they do not recite
 * a script. Credential shows when the profile carries one so it gets said
 * out loud at record time.
 */
export function BeatPrompter({
  label,
  text,
  credential,
}: {
  label: string;
  text: string;
  credential: string | null;
}) {
  return (
    <View style={beatStyles.wrap}>
      {credential?.trim() ? (
        <Text style={beatStyles.credential}>{credential.trim()}</Text>
      ) : null}
      <Text style={beatStyles.label}>{label}</Text>
      <Text style={beatStyles.text}>{text}</Text>
    </View>
  );
}

const beatStyles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 8,
  },
  credential: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
    color: color.accentTint,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  text: {
    fontSize: 26,
    lineHeight: 34,
    fontWeight: '800',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    paddingHorizontal: 20,
    paddingVertical: 12,
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
