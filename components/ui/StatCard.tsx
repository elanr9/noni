import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { borderWidth, color, radius, shadow, space, type } from '../../theme/tokens';
import { PressableScale } from './PressableScale';

export interface StatCardProps {
  label: string;
  value: string;
  selected?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function StatCard({
  label,
  value,
  selected = false,
  onPress,
  style,
}: StatCardProps) {
  const cardStyle = [styles.card, selected && styles.cardSelected, shadow.shadowCard, style];
  const body = (
    <>
      <Text style={[styles.value, selected && styles.valueSelected]}>{value}</Text>
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </>
  );

  if (onPress !== undefined) {
    return (
      <PressableScale
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={onPress}
        style={cardStyle}
      >
        {body}
      </PressableScale>
    );
  }

  return <View style={cardStyle}>{body}</View>;
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    borderRadius: radius.lg,
    borderWidth: borderWidth.hair,
    borderColor: color.border,
    backgroundColor: color.surface,
    paddingHorizontal: space.cardPad,
    paddingVertical: space[6],
    gap: 4,
  },
  cardSelected: {
    backgroundColor: color.blue200,
    borderColor: color.blue300,
  },
  value: {
    fontSize: type.size.cardLg,
    fontWeight: type.weight.heavy,
    color: color.textStrong,
    letterSpacing: type.tracking.title,
  },
  valueSelected: {
    color: color.ink,
  },
  label: {
    fontSize: type.size.meta,
    fontWeight: type.weight.semibold,
    color: color.textMuted,
  },
  labelSelected: {
    color: color.blue700,
  },
});
