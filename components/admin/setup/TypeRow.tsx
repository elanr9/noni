// Admin handoff §7 steps 2–3 — one row per post type: name, structure
// line, 34px round stepper.
import { StyleSheet, Text, View } from 'react-native';

import { color, radiusAdmin, shadow } from '../../../theme/tokens';
import { Stepper } from './Stepper';

export interface TypeRowProps {
  label: string;
  /** e.g. "Hook, N points, outro". */
  structure: string;
  value: number;
  onChange: (value: number) => void;
}

export function TypeRow({ label, structure, value, onChange }: TypeRowProps) {
  return (
    <View style={[styles.row, shadow.shadowCard]}>
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.structure} numberOfLines={1}>
          {structure}
        </Text>
      </View>
      <Stepper label={label} value={value} onChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.white,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    color: color.ink,
  },
  structure: {
    fontSize: 12,
    fontWeight: '400',
    color: color.slate400,
  },
});
