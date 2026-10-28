import type { ReactNode } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { color, radius, shadow, space, text } from '../../theme/v2';
import { Press } from './Press';

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  /** Padding; 16 by default. */
  pad?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/** White, r16, card shadow, padding 16, 12 below. Pressable when it has onPress. */
export function Card({ children, onPress, pad = space[4], style, accessibilityLabel }: CardProps) {
  const base: ViewStyle = { backgroundColor: color.card, borderRadius: radius.card, padding: pad, marginBottom: space.cardGap, ...shadow.card };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={[base, style]}>
      {children}
    </Press>
  );
}

/** Centred card with one grey body line. */
export function Empty({ children }: { children: string }) {
  return (
    <Card style={{ alignItems: 'center' }}>
      <Text style={[text.body, { color: color.grey4, textAlign: 'center' }]}>{children}</Text>
    </Card>
  );
}
