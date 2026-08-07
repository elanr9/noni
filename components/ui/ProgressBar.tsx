import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { color, motion, radius, space } from '../../theme/tokens';

export interface ProgressBarProps {
  /** 0..1 fill for the continuous bar. */
  progress?: number;
  /** Discrete step mode: current 1-based step. */
  step?: number;
  /** Discrete step mode: total steps. */
  total?: number;
  variant?: 'bar' | 'dots';
  style?: StyleProp<ViewStyle>;
}

export function ProgressBar({
  progress,
  step,
  total,
  variant = 'bar',
  style,
}: ProgressBarProps) {
  if (variant === 'dots' && total !== undefined && total > 0) {
    const current = step ?? 0;
    return (
      <View style={[styles.dotsRow, style]}>
        {Array.from({ length: total }, (_, i) => (
          <View
            key={i}
            style={[styles.dot, i < current ? styles.dotOn : styles.dotOff]}
          />
        ))}
      </View>
    );
  }

  const fraction =
    progress !== undefined
      ? Math.min(1, Math.max(0, progress))
      : total !== undefined && total > 1 && step !== undefined
        ? Math.min(1, Math.max(0, step / (total - 1)))
        : total !== undefined && total > 0 && step !== undefined
          ? Math.min(1, Math.max(0, step / total))
          : 0;

  return (
    <View style={[styles.track, style]}>
      <View style={[styles.fill, { flex: Math.max(fraction, 0.02) }]} />
      <View style={{ flex: Math.max(1 - fraction, 0) }} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
    flexDirection: 'row',
    overflow: 'hidden',
    width: '100%',
  },
  fill: {
    backgroundColor: color.blue300,
    borderRadius: radius.pill,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  dot: {
    height: 6,
    borderRadius: radius.pill,
    flex: 1,
  },
  dotOn: {
    backgroundColor: color.blue300,
  },
  dotOff: {
    backgroundColor: color.fillQuiet,
  },
});

/** Duration token for progress fill animations (Wave 3 wires motion). */
export const PROGRESS_FILL_MS = motion.base;
