import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color, radius } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';

export interface CheckboxReasonRowProps {
  label: string;
  selected: boolean;
  onToggle: () => void;
}

/**
 * Admin handoff — multi-select reason button. Quiet fill default; selected
 * flips to blue-100 with blue-700 text and a blue-500 rounded-square check.
 */
export function CheckboxReasonRow({ label, selected, onToggle }: CheckboxReasonRowProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onToggle}
      style={[styles.row, selected && { backgroundColor: color.blue100 }]}
    >
      <View style={[styles.box, selected ? styles.boxOn : styles.boxOff]}>
        {selected && <Icon name="check" size={12} color={color.white} />}
      </View>
      <Text style={[styles.label, { color: selected ? color.blue700 : color.ink }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 13,
    borderRadius: radius.sm,
    backgroundColor: color.fillQuiet,
  },
  box: {
    width: 18,
    height: 18,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: {
    backgroundColor: color.blue500,
  },
  boxOff: {
    backgroundColor: color.white,
    borderWidth: 1.5,
    borderColor: color.lineStrong,
  },
  label: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
});
