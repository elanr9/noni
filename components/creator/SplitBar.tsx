import { StyleSheet, Text, View } from 'react-native';

import { color, shadow } from '../../theme/tokens';
import { Icon } from '../ui/Icon';

export interface SplitBarProps {
  range: string;
  tiktokPct: number;
  instagramPct: number;
}

export function SplitBar({ range, tiktokPct, instagramPct }: SplitBarProps) {
  return (
    <View style={[styles.card, shadow.shadowCard]}>
      <Text style={styles.caption}>Where it came from · {range}</Text>
      <View style={styles.bar}>
        <View style={[styles.segment, { backgroundColor: color.accent, width: `${tiktokPct}%` }]} />
        <View
          style={[styles.segment, { backgroundColor: color.blue300, width: `${instagramPct}%` }]}
        />
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <Icon name="music-2" size={14} color={color.ink} />
          <Text style={styles.legendText}>TikTok {tiktokPct}%</Text>
        </View>
        <View style={styles.legendItem}>
          <Icon name="at-sign" size={14} color={color.ink} />
          <Text style={styles.legendText}>Instagram {instagramPct}%</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.white,
    borderRadius: 18,
    padding: 16,
    gap: 10,
  },
  caption: {
    fontSize: 13,
    fontWeight: '600',
    color: color.slate500,
  },
  bar: {
    height: 10,
    borderRadius: 999,
    backgroundColor: color.fillQuiet,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  segment: {
    height: '100%',
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendText: {
    fontSize: 13,
    fontWeight: '600',
    color: color.ink,
  },
});
