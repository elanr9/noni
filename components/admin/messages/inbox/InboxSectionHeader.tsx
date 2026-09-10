import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { color, motion, type } from '../../../../theme/tokens';
import { Icon } from '../../../ui/Icon';

export interface InboxSectionHeaderProps {
  label: string;
  open: boolean;
  onToggle: () => void;
  count?: number;
  trailing?: ReactNode;
}

/** Collapsible section row: chevron (rotates -90 when closed), label, count, trailing control. */
export function InboxSectionHeader({
  label,
  open,
  onToggle,
  count,
  trailing,
}: InboxSectionHeaderProps) {
  const [spin] = useState(() => new Animated.Value(open ? 0 : 1));

  useEffect(() => {
    Animated.timing(spin, {
      toValue: open ? 0 : 1,
      duration: motion.fast,
      easing: motion.easeOut,
      useNativeDriver: true,
    }).start();
  }, [open, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-90deg'] });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${label}, ${open ? 'collapse' : 'expand'}`}
      onPress={onToggle}
      style={styles.row}
    >
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Icon name="chevron-down" size={14} color={color.slate400} />
      </Animated.View>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      {count !== undefined && count > 0 && <Text style={styles.count}>{count}</Text>}
      {trailing !== undefined && <View style={styles.trailing}>{trailing}</View>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingTop: 14,
    paddingBottom: 6,
    paddingHorizontal: 2,
  },
  label: {
    flex: 1,
    fontSize: type.size.label,
    fontWeight: type.weight.bold,
    letterSpacing: type.tracking.label,
    color: color.slate500,
  },
  count: {
    fontSize: type.size.label,
    fontWeight: type.weight.bold,
    color: color.blue700,
  },
  trailing: {
    marginVertical: -4,
  },
});
