import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { color, control } from '../../theme/v2';
import { Icon } from './Icon';
import { Press } from './Press';

export interface RowProps {
  children: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  /** Last row in its card: no divider. */
  last?: boolean;
  top?: number;
  bottom?: number;
  style?: StyleProp<ViewStyle>;
}

/** Row inside a card: gap 12, padding 12 0, grey-1 divider except last, min height 56. */
export function Row({ children, onPress, chevron, last, top = 12, bottom = 12, style }: RowProps) {
  const base: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: top,
    paddingBottom: bottom,
    minHeight: control.row,
    borderBottomWidth: last ? 0 : 1,
    borderBottomColor: color.grey1,
  };
  const content = (
    <>
      {children}
      {chevron ? <Icon name="chevron_right" size={22} color={color.grey3} /> : null}
    </>
  );
  if (!onPress) return <View style={[base, style]}>{content}</View>;
  return (
    <Press onPress={onPress} accessibilityRole="button" style={[base, style]}>
      {content}
    </Press>
  );
}
