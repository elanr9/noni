import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from './Screen';

type Props = {
  text: string;
  running: boolean;
  paused: boolean;
  speed: number;
  resetKey: number;
  onTap?: () => void;
};

const BASE_WORDS_PER_MINUTE = 150;

export function Teleprompter({
  text,
  running,
  paused,
  speed,
  resetKey,
  onTap,
}: Props) {
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
    const msPerWord = 60000 / (BASE_WORDS_PER_MINUTE * speed);
    const timer = setInterval(() => {
      setIndex((i) => Math.min(i + 1, words.length - 1));
    }, msPerWord);
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
    <Pressable style={styles.wrap} onPress={onTap}>
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
                  ? styles.done
                  : i === index
                    ? styles.active
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

const styles = StyleSheet.create({
  wrap: {
    height: '34%',
    overflow: 'hidden',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
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
  done: { color: 'rgba(255,255,255,0.45)' },
  active: { color: colors.accent, fontWeight: '800' },
  upcoming: { color: '#FFFFFF' },
  pausedChip: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  pausedText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
