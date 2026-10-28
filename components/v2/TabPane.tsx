import { useEffect, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { motion } from '../../theme/v2';

export interface TabPaneProps {
  /** Key of the content shown. A change remounts the pane and replays the entrance. */
  k: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 260 by default; 220 for small content. */
  duration?: number;
}

/** Fades and lifts new content in: opacity 0 to 1, translateY 6 to 0 on the tab-in curve. Flex column. */
export function TabPane({ k, children, style, duration = motion.tabIn }: TabPaneProps) {
  return (
    <TabPaneInner key={k} style={style} duration={duration}>
      {children}
    </TabPaneInner>
  );
}

function TabPaneInner({ children, style, duration }: { children: ReactNode; style?: StyleProp<ViewStyle>; duration: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withTiming(1, { duration, easing: motion.tabEase }));
  }, [t, duration]);
  const animated = useAnimatedStyle(() => ({ opacity: t.get(), transform: [{ translateY: 6 * (1 - t.get()) }] }));
  return <Animated.View style={[{ flex: 1, minHeight: 0 }, style, animated]}>{children}</Animated.View>;
}
