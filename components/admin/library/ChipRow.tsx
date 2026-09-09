import { StyleSheet, Text, View } from 'react-native';

import { borderWidth, color, radiusAdmin, type } from '../../../theme/tokens';
import { PressableScale } from '../../ui/PressableScale';

export interface ChipRowProps<T extends string | null> {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  wrap?: boolean;
}

/** Small pill chips, active solid blue-500. Shared by lane sub filters and the filter sheet. */
export function ChipRow<T extends string | null>({ options, value, onChange, wrap = false }: ChipRowProps<T>) {
  return (
    <View style={[styles.row, wrap && styles.wrap]}>
      {options.map((option) => {
        const active = option.id === value;
        return (
          <PressableScale
            key={option.id ?? 'all'}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.id)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.text, active && styles.textActive]}>{option.label}</Text>
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
  wrap: {
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
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
