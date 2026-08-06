import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import { color, type } from '../../../theme/tokens';

export interface SectionLabelProps {
  children: string;
  style?: StyleProp<TextStyle>;
}

/** Admin handoff §1 — label type: 700 12px uppercase with label tracking. */
export function SectionLabel({ children, style }: SectionLabelProps) {
  return <Text style={[styles.label, style]}>{children.toUpperCase()}</Text>;
}

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: type.tracking.label,
    color: color.slate400,
  },
});
