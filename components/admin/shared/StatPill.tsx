import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { color } from '../../../theme/tokens';

export interface StatPillProps {
  /** Bold ink figure, e.g. "$238". */
  value: string;
  /** Quiet unit after it, e.g. "/day avg". */
  unit: string;
  style?: StyleProp<ViewStyle>;
}

/** Admin handoff — off-white pill: 700 11.5px ink value + 600 11.5px slate-500 unit. */
export function StatPill({ value, unit, style }: StatPillProps) {
  return (
    <View style={[styles.pill, style]}>
      <Text numberOfLines={1} style={styles.value}>
        {value}
      </Text>
      <Text numberOfLines={1} style={styles.text}>
        {unit}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: color.offWhite,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11.5,
    fontWeight: '600',
    color: color.slate500,
  },
  value: {
    fontSize: 11.5,
    fontWeight: '700',
    color: color.ink,
  },
});
