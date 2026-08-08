import { useState } from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { color, type } from '../theme/tokens';
import { AccountSwitcherSheet } from './AccountSwitcherSheet';
import { Icon } from './ui/Icon';
import { PressableScale } from './ui/PressableScale';

export function AccountSwitcherCaret({
  name,
  style,
  textStyle,
  iconSize = 18,
}: {
  name: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  iconSize?: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Switch accounts"
        onPress={() => setOpen(true)}
        style={[styles.hit, style]}
      >
        <Text style={[styles.name, textStyle]} numberOfLines={1}>
          {name}
        </Text>
        <Icon name="chevron-down" size={iconSize} color={color.ink} />
      </PressableScale>
      <AccountSwitcherSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  hit: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    maxWidth: '100%',
    paddingVertical: 4,
  },
  name: {
    flexShrink: 1,
    fontSize: type.size.titleSm,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
});
