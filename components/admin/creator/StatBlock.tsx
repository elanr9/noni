import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { color, radiusAdmin, type } from '../../../theme/tokens';

export interface StatBlockProps {
  label: string;
  value: string;
  style?: StyleProp<ViewStyle>;
}

/** Admin handoff §10 — one stat on an off-white inner block. */
export function StatBlock({ label, value, style }: StatBlockProps) {
  return (
    <View style={[styles.block, style]}>
      <Text style={styles.value} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    flex: 1,
    backgroundColor: color.offWhite,
    borderRadius: radiusAdmin.sm,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 2,
  },
  value: {
    fontSize: type.size.body,
    fontWeight: '700',
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  label: {
    fontSize: type.size.micro,
    fontWeight: '700',
    color: color.slate400,
    textTransform: 'uppercase',
    letterSpacing: type.tracking.label,
  },
});
