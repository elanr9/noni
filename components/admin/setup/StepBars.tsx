// Admin handoff §7 — dots progress for the three setup steps. 6px bars,
// done and current blue, future line-strong.
import { StyleSheet, View } from 'react-native';

import { color, radiusAdmin } from '../../../theme/tokens';

export function StepBars({ step, total }: { step: number; total: number }) {
  return (
    <View style={styles.row}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[styles.bar, i <= step ? styles.barDone : styles.barFuture]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  bar: {
    width: 36,
    height: 6,
    borderRadius: radiusAdmin.pill,
  },
  barDone: {
    backgroundColor: color.blue500,
  },
  barFuture: {
    backgroundColor: color.lineStrong,
  },
});
