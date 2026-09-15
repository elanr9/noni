import { StyleSheet, Text, View } from 'react-native';

import { color, radius } from '../../theme/tokens';
import { Icon } from '../ui/Icon';

export const WAIT_RED = '#E5484D';
export const WAIT_RED_SOFT = '#FDE8E9';
export const WAIT_RED_TINT = '#FFF7F7';

export interface WaitBadgeProps {
  count: number;
  size?: number;
}

/** Red count when something waits, green check when caught up. */
export function WaitBadge({ count, size = 20 }: WaitBadgeProps) {
  if (count <= 0) {
    return (
      <View
        accessibilityLabel="Caught up"
        style={[styles.clear, { width: size, height: size }]}
      >
        <Icon name="check" size={Math.round(size * 0.62)} color={color.green} strokeWidth={2.5} />
      </View>
    );
  }
  return (
    <View
      accessibilityLabel={`${count} waiting`}
      style={[styles.count, { minWidth: size, height: size }]}
    >
      <Text style={[styles.countText, { fontSize: Math.round(size * 0.58) }]}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  clear: {
    borderRadius: radius.pill,
    backgroundColor: color.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  count: {
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    backgroundColor: WAIT_RED,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  countText: {
    color: color.white,
    fontWeight: '800',
  },
});
