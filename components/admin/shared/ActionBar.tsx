import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { color, space } from '../../../theme/tokens';

export interface ActionBarProps {
  /** Buttons, laid out in a row with 10px gap: ghost/outline left, primary right. */
  children: ReactNode;
  dark?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Admin handoff — pinned footer over a fade-up gradient; content scrolls
 * behind it. Light: transparent to off-white at 34%. Dark: to ink-900 at 42%.
 */
export function ActionBar({ children, dark = false, style }: ActionBarProps) {
  const insets = useSafeAreaInsets();
  const ground = dark ? color.ink900 : color.offWhite;

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 26) }, style]}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="noniActionBarFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={ground} stopOpacity="0" />
            <Stop offset={dark ? '0.42' : '0.34'} stopColor={ground} stopOpacity="1" />
            <Stop offset="1" stopColor={ground} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#noniActionBarFade)" />
      </Svg>
      <View style={styles.row}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingTop: 12,
    paddingHorizontal: space.gutterAdmin,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
});
