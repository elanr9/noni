// Admin handoff §7 — 34px round steppers. The count sits between the
// minus and plus buttons; clip and slide counts are never a human field,
// these steppers only size the week's pool.
import { Minus, Plus } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { color, radiusAdmin, type } from '../../../theme/tokens';
import { PressableScale } from '../../ui/PressableScale';

export interface StepperProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** Count size — 26 on the ratio cards, 22 on type rows. */
  valueSize?: number;
}

export function Stepper({ label, value, onChange, valueSize = 22 }: StepperProps) {
  return (
    <View style={styles.row}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`Fewer ${label}`}
        onPress={() => onChange(Math.max(0, value - 1))}
        style={styles.btn}
      >
        <Minus size={16} color={color.slate500} strokeWidth={2.5} />
      </PressableScale>
      <Text style={[styles.value, { fontSize: valueSize }]}>{value}</Text>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`More ${label}`}
        onPress={() => onChange(value + 1)}
        style={styles.btn}
      >
        <Plus size={16} color={color.slate500} strokeWidth={2.5} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  btn: {
    width: 34,
    height: 34,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    minWidth: 34,
    textAlign: 'center',
    fontWeight: '700',
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
});
