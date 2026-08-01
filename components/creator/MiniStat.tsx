import { StyleSheet, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { color, shadow } from '../../theme/tokens';
import { Icon, type IconName } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';

export interface MiniStatProps {
  label: string;
  icon: IconName;
  value: string;
  delta: string;
  series: number[];
  onPress: () => void;
}

export function MiniStat({ label, icon, value, delta, series, onPress }: MiniStatProps) {
  const max = Math.max(...series);
  const min = Math.min(...series);
  const span = Math.max(1, max - min);
  const points = series
    .map((v, i) => {
      const x = series.length > 1 ? (i / (series.length - 1)) * 100 : 0;
      const y = 2 + (1 - (v - min) / span) * 24;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${label} ${value}`}
      onPress={onPress}
      style={[styles.card, shadow.shadowCard]}
    >
      <View style={styles.labelRow}>
        <Icon name={icon} size={13} color={color.slate400} />
        <Text style={styles.label}>{label}</Text>
      </View>
      <Text style={styles.value}>{value}</Text>
      <Svg width="100%" height={24} viewBox="0 0 100 28" preserveAspectRatio="none">
        <Polyline
          points={points}
          fill="none"
          stroke={color.blue300}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </Svg>
      <Text style={styles.delta}>{delta}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 16,
    padding: 11,
    gap: 4,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: color.slate500,
  },
  value: {
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: color.ink,
  },
  delta: {
    fontSize: 11,
    fontWeight: '700',
    color: color.green,
  },
});
