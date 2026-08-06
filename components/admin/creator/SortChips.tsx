import { StyleSheet, Text, View } from 'react-native';

import { borderWidth, color, radiusAdmin, type } from '../../../theme/tokens';
import { PressableScale } from '../../ui/PressableScale';

export interface SortChipsProps<T extends string> {
  options: Array<{ key: T; label: string }>;
  value: T;
  onChange: (key: T) => void;
}

/** Admin handoff §10 — roster sort chips, active solid blue-500. */
export function SortChips<T extends string>({
  options,
  value,
  onChange,
}: SortChipsProps<T>) {
  return (
    <View style={styles.row}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <PressableScale
            key={option.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.key)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.text, active && styles.textActive]}>
              {option.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  chipActive: {
    backgroundColor: color.blue500,
    borderColor: color.blue500,
  },
  text: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.slate500,
  },
  textActive: {
    color: color.white,
  },
});
