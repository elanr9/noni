// Week screen counter tile (SSManager.jsx WeekScreen Tile): Reels or
// Slideshows, done over total, a 6pt progress bar. The tile you are on is
// blue500 with white text and a check; the other reads as a quiet tab:
// grey text, no shadow, faint fill. Tapping switches format.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '../../ui/Icon';
import { color, radius, shadow, type as typeToken } from '../../../theme/tokens';
import type { BriefMediaFormat } from '../../../lib/briefs-api';
import { FORMAT_LABEL_PLURAL } from '../../../lib/brief-copy';
import { FORMAT_ICON } from './BriefChip';

export interface FormatCounterCardProps {
  format: BriefMediaFormat;
  done: number;
  total: number;
  active: boolean;
  onPress?: () => void;
}

export function FormatCounterCard({ format, done, total, active, onPress }: FormatCounterCardProps) {
  const fg = active ? color.white : color.slate500;
  const pct = total > 0 ? Math.min(1, done / total) : 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${FORMAT_LABEL_PLURAL[format]}, ${done} of ${total}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        active ? styles.cardActive : styles.cardIdle,
        pressed && onPress ? styles.pressed : null,
      ]}
    >
      <View style={styles.titleRow}>
        <Icon name={FORMAT_ICON[format]} size={17} color={fg} />
        <Text style={[styles.title, { color: fg }]}>{FORMAT_LABEL_PLURAL[format]}</Text>
        {active ? (
          <View style={styles.check}>
            <Icon name="check" size={12} color={color.blue500} strokeWidth={3} />
          </View>
        ) : null}
      </View>
      <Text style={[styles.count, { color: fg }]}>
        {done}
        <Text style={[styles.total, { color: fg }]}>{` / ${total}`}</Text>
      </Text>
      <View style={[styles.track, { backgroundColor: active ? color.whiteA28 : color.fillQuiet }]}>
        <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: active ? color.white : color.slate300 }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: radius.lg,
  },
  cardActive: {
    backgroundColor: color.blue500,
    ...shadow.shadowAccent,
  },
  cardIdle: {
    backgroundColor: color.fillQuiet,
    borderWidth: 1,
    borderColor: color.border,
  },
  check: { marginLeft: 'auto', width: 20, height: 20, borderRadius: 999, backgroundColor: color.white, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.9 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  title: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 14 },
  count: {
    marginTop: 10,
    fontFamily: typeToken.font.display,
    fontWeight: '800',
    fontSize: 30,
    letterSpacing: -0.8,
    lineHeight: 34,
  },
  total: { fontFamily: typeToken.font.ui, fontWeight: '600', fontSize: 16, opacity: 0.6, letterSpacing: 0 },
  track: { marginTop: 10, height: 6, borderRadius: 99, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 99 },
});
