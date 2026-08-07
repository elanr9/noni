import { StyleSheet, Text } from 'react-native';

import { borderWidth, color, radius, space, type } from '../../theme/tokens';
import { PressableScale } from './PressableScale';

export interface OptionCardProps {
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}

export function OptionCard({
  label,
  hint,
  selected,
  onPress,
  disabled = false,
}: OptionCardProps) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.card,
        selected && styles.cardSelected,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
      {hint !== undefined && <Text style={styles.hint}>{hint}</Text>}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: borderWidth.field,
    borderColor: color.border,
    backgroundColor: color.surface,
    paddingHorizontal: space.cardPad,
    paddingVertical: space[6],
    gap: 4,
  },
  cardSelected: {
    borderColor: color.accent,
    backgroundColor: color.surfaceBrandSoft,
    borderWidth: borderWidth.select,
  },
  label: {
    fontSize: type.size.body,
    fontWeight: type.weight.semibold,
    color: color.textStrong,
  },
  labelSelected: {
    color: color.blue700,
    fontWeight: type.weight.bold,
  },
  hint: {
    fontSize: type.size.meta,
    color: color.textMuted,
    lineHeight: type.size.meta * type.leading.body,
  },
  disabled: {
    opacity: 0.35,
  },
});
