// Admin handoff §8 shell — step dots: seven 6px-tall bars, the current
// one stretched to 26px blue-500, past blue-300, future line-strong.
import { StyleSheet, View } from 'react-native';

import { color, radiusAdmin } from '../../../theme/tokens';

export interface StepDotsProps {
  /** 0-based current step. */
  current: number;
  total: number;
}

export function StepDots({ current, total }: StepDotsProps) {
  return (
    <View style={styles.row}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i === current
              ? styles.dotCurrent
              : i < current
                ? styles.dotPast
                : styles.dotFuture,
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    height: 6,
    borderRadius: radiusAdmin.pill,
  },
  dotCurrent: {
    width: 26,
    backgroundColor: color.blue500,
  },
  dotPast: {
    width: 6,
    backgroundColor: color.blue300,
  },
  dotFuture: {
    width: 6,
    backgroundColor: color.lineStrong,
  },
});
