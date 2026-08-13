import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { color, radius, shadow } from '../../../theme/tokens';
import { PressableScale } from '../../ui/PressableScale';

export interface CardProps {
  children: ReactNode;
  /** Reference default is 14; dense rows use 12 to 13. */
  pad?: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Admin handoff — white surface, 1px line border, radius-lg, card shadow. */
export function Card({ children, pad = 14, onPress, style }: CardProps) {
  const base = [styles.card, shadow.shadowCard, { padding: pad }, style];

  if (onPress) {
    return (
      <PressableScale accessibilityRole="button" onPress={onPress} style={base}>
        {children}
      </PressableScale>
    );
  }
  return <View style={base}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.lg,
  },
});
