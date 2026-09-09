import { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { color, type } from '../../theme/tokens';

/**
 * Subtitle-style teleprompter: two short lines at a time, sitting on the
 * camera feed, advancing at a natural UGC talking pace. The script only
 * moves while `running` (recording); idle shows the opening lines so the
 * creator knows how the clip starts. Tap pauses and resumes.
 */

export interface TeleprompterOverlayProps {
  text: string;
  /** 1 = about 150 words a minute. */
  speed: number;
  running: boolean;
  style?: StyleProp<ViewStyle>;
}

const MAX_LINE_CHARS = 30;
const MS_PER_WORD = 400;
const MIN_CHUNK_MS = 1400;

function wrapLines(text: string): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current.length === 0 ? word : `${current} ${word}`;
    if (next.length > MAX_LINE_CHARS && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

/** Splits the script into two-line chunks, breaking on sentences first. */
function chunkScript(text: string): string[][] {
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const chunks: string[][] = [];
  for (const sentence of sentences) {
    const lines = wrapLines(sentence);
    for (let i = 0; i < lines.length; i += 2) {
      chunks.push(lines.slice(i, i + 2));
    }
  }
  return chunks.length > 0 ? chunks : [[text.trim()]];
}

function chunkDurationMs(lines: string[], speed: number): number {
  const words = lines.join(' ').split(' ').filter(Boolean).length;
  return Math.max(MIN_CHUNK_MS, (words * MS_PER_WORD) / speed);
}

export function TeleprompterOverlay({
  text,
  speed,
  running,
  style,
}: TeleprompterOverlayProps) {
  const chunks = useMemo(() => chunkScript(text), [text]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [fade] = useState(() => new Animated.Value(1));

  // A new script or a new take starts back at the opening lines.
  const resetKey = `${running ? 'run' : 'idle'}|${text}`;
  const [seenKey, setSeenKey] = useState(resetKey);
  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    setIndex(0);
    setPaused(false);
  }

  const atEnd = index >= chunks.length - 1;

  useEffect(() => {
    if (!running || paused || atEnd) return;
    const hold = chunkDurationMs(chunks[index] ?? [], speed);
    const timer = setTimeout(() => {
      Animated.sequence([
        Animated.timing(fade, { toValue: 0, duration: 90, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 140, useNativeDriver: true }),
      ]).start();
      setIndex((i) => Math.min(i + 1, chunks.length - 1));
    }, hold);
    return () => clearTimeout(timer);
  }, [running, paused, atEnd, index, chunks, speed, fade]);

  const lines = chunks[index] ?? [];
  const progress = chunks.length > 1 ? (index + 1) / chunks.length : 1;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={paused ? 'Resume script' : 'Pause script'}
      onPress={() => {
        if (running) setPaused((p) => !p);
      }}
      style={[styles.root, style]}
    >
      <View style={styles.labels}>
        <Text style={styles.microLabel}>
          {running ? (paused ? 'Script paused' : 'Script') : 'Script starts here'}
        </Text>
        <Text style={styles.microHint}>Not shown on the video</Text>
      </View>
      <Animated.View style={[styles.box, { opacity: fade }]}>
        {lines.map((line, i) => (
          <Text key={`${index}-${i}`} style={styles.line}>
            {line}
          </Text>
        ))}
      </Animated.View>
      {chunks.length > 1 ? (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>
      ) : null}
      {atEnd && running ? (
        <Text style={styles.endHint}>End of script. Stop when you are done.</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 22,
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
  box: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.42)',
    maxWidth: '100%',
  },
  line: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: type.weight.heavy,
    textAlign: 'center',
    color: color.white,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  track: {
    width: 120,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: color.white,
  },
  endHint: {
    fontSize: type.size.micro11,
    fontWeight: type.weight.semibold,
    color: color.whiteA60,
  },
});
