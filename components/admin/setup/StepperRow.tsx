import type { JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, radius, type } from '../../../theme/tokens';
import { PressableScale } from '../../ui/PressableScale';

export function StepperRow(props: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}): JSX.Element {
  const { label, value, onChange } = props;
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.controls}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`Fewer ${label}`}
          onPress={() => onChange(value - 1)}
          style={styles.btn}
        >
          <Text style={styles.btnText}>−</Text>
        </PressableScale>
        <Text style={styles.value}>{value}</Text>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`More ${label}`}
          onPress={() => onChange(value + 1)}
          style={styles.btn}
        >
          <Text style={styles.btnText}>+</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  label: {
    flex: 1,
    fontSize: type.size.body,
    fontWeight: '600',
    color: color.ink,
  },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  btn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.fillQuiet,
  },
  btnText: {
    fontSize: type.size.body,
    fontWeight: '800',
    color: color.slate500,
  },
  value: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: type.size.body,
    fontWeight: '800',
    color: color.ink,
  },
});
