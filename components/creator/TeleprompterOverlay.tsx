import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { color, type } from '../../theme/tokens';

/**
 * Transparent teleprompter for hook and CTA clips (SCREENS §3). No scrim
 * band; sits directly on the camera feed. Words auto-advance over
 * durationMs; a tap anywhere pauses and resumes.
 */

export interface TeleprompterOverlayProps {
  text: string;
  /** Total time to sweep every word, e.g. the 20s clip cap. */
  durationMs: number;
  style?: StyleProp<ViewStyle>;
}

export function TeleprompterOverlay({ text, durationMs, style }: TeleprompterOverlayProps) {
  const words = useMemo(() => text.split(/\s+/).filter((w) => w.length > 0), [text]);
  const [wordIndex, setWordIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setWordIndex(0);
    setPaused(false);
  }, [text]);

  const done = words.length === 0 || wordIndex >= words.length - 1;

  useEffect(() => {
    if (paused || done) return;
    const step = Math.max(durationMs / Math.max(words.length, 1), 60);
    const timer = setInterval(() => {
      setWordIndex((i) => i + 1);
    }, step);
    return () => clearInterval(timer);
  }, [paused, done, durationMs, words.length]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={paused ? 'Resume teleprompter' : 'Pause teleprompter'}
      onPress={() => setPaused((p) => !p)}
      style={[styles.root, style]}
    >
      <View style={styles.labels}>
        <Text style={styles.microLabel}>Teleprompter</Text>
        <Text style={styles.microHint}>(This won&apos;t show on the video)</Text>
      </View>
      <Text style={styles.line}>
        {words.map((word, i) => (
          <Text
            key={`${i}-${word}`}
            style={i < wordIndex ? styles.spoken : i === wordIndex ? styles.current : styles.upcoming}
          >
            {word}
            {i < words.length - 1 ? ' ' : ''}
          </Text>
        ))}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 26,
  },
  labels: {
    alignItems: 'center',
    gap: 2,
  },
  microLabel: {
    fontSize: type.size.micro,
    fontWeight: type.weight.heavy,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: color.whiteA60,
  },
  microHint: {
    fontSize: type.size.micro11,
    fontWeight: type.weight.semibold,
    color: color.whiteA45,
  },
  line: {
    fontSize: type.size.titleSm,
    fontWeight: type.weight.semibold,
    lineHeight: 38,
    textAlign: 'center',
    color: color.white,
  },
  spoken: {
    color: color.whiteA45,
  },
  current: {
    color: color.accentTint,
    fontWeight: type.weight.heavy,
  },
  upcoming: {
    color: color.white,
  },
});
