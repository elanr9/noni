// Week screen counter tile (SSManager.jsx WeekScreen Tile): Reels or
// Slideshows, done over total, a 6pt progress bar. Active tile is blue500
// with white text; the other is a white card. Tapping switches format.

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
  const fg = active ? color.white : color.ink;
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
      </View>
      <Text style={[styles.count, { color: fg }]}>
        {done}
        <Text style={[styles.total, { color: fg }]}> / {total}</Text>
      </Text>
      <View style={[styles.track, { backgroundColor: active ? color.whiteA28 : color.fillQuiet }]}>
        <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: active ? color.white : color.blue500 }]} />
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
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.border,
    ...shadow.shadowCard,
  },
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
