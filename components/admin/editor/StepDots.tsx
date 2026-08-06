// Admin handoff §8 shell — step dots: seven 6px-tall bars, the current
// one stretched to 26px blue-500, past blue-300, future line-strong, with
// the "Step N of 7 · Hook" line beneath.
import { StyleSheet, Text, View } from 'react-native';

import { color, radiusAdmin, type } from '../../../theme/tokens';

export interface StepDotsProps {
  /** 0-based current step. */
  current: number;
  total: number;
  /** Step name for the label, e.g. "Hook". */
  name: string;
}

export function StepDots({ current, total, name }: StepDotsProps) {
  return (
    <View style={styles.block}>
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
      <Text style={styles.label}>
        {`Step ${current + 1} of ${total} · ${name}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: 8,
  },
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
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: type.tracking.flat,
    color: color.slate400,
  },
});
