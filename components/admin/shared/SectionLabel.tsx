import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

import { color, type } from '../../../theme/tokens';

export interface SectionLabelProps {
  children: string;
  /** Trailing slot on the same baseline, e.g. a count or a range picker. */
  right?: ReactNode;
  style?: StyleProp<TextStyle>;
}

/** Admin handoff — label type: 700 12px uppercase, label tracking, slate-500. */
export function SectionLabel({ children, right, style }: SectionLabelProps) {
  const label = <Text style={[styles.label, style]}>{children.toUpperCase()}</Text>;
  if (right === undefined) return label;
  return (
    <View style={styles.row}>
      <View style={styles.grow}>{label}</View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  grow: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: type.tracking.label,
    color: color.slate500,
  },
});
