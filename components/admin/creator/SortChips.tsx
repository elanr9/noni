import { StyleSheet, Text, View } from 'react-native';

import { color, radiusAdmin, shadow, type } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';

export interface SortChipsProps<T extends string> {
  options: Array<{ key: T; label: string }>;
  value: T;
  onChange: (key: T) => void;
}

/** Creators list sort chips: selected blue-100/blue-700 with a trending-up glyph, unselected white on card shadow. */
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
            style={[styles.chip, active ? styles.chipActive : shadow.shadowCard]}
          >
            {active && <Icon name="trending-up" size={12} color={color.blue700} />}
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 32,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.white,
  },
  chipActive: {
    backgroundColor: color.blue100,
  },
  text: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.slate500,
  },
  textActive: {
    color: color.blue700,
  },
});
