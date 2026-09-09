import { useEffect, useRef, type ReactNode } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useKeyboardHeight } from '../../lib/keyboard';
import { color, motion, radius, space } from '../../theme/tokens';
import { SkeletonCard, SkeletonLine } from '../ui/Skeleton';

/** Short fade-up used by screen shells so mounts never pop in. */
export function useScreenEnter() {
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: motion.fast,
      easing: motion.easeOut,
      useNativeDriver: true,
    }).start();
  }, [enter]);
  return {
    opacity: enter,
    transform: [
      {
        translateY: enter.interpolate({
          inputRange: [0, 1],
          outputRange: [8, 0],
        }),
      },
    ],
  };
}

export interface ScreenProps {
  children: ReactNode;
  /** Pinned above the home indicator; typically a full-width Button. */
  footer?: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  edges?: ('top' | 'right' | 'bottom' | 'left')[];
  bg?: string;
}

export function Screen({
  children,
  footer,
  scroll = false,
  style,
  contentStyle,
  edges = ['top', 'left', 'right'],
  bg = color.white,
}: ScreenProps) {
  const keyboardHeight = useKeyboardHeight();
  const enterStyle = useScreenEnter();

  const body = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.gutter, styles.scrollContent, contentStyle]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, styles.gutter, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView
      style={[
        styles.safe,
        { backgroundColor: bg, paddingBottom: keyboardHeight },
        style,
      ]}
      edges={edges}
    >
      <Animated.View style={[styles.flex, enterStyle]}>
        {body}
        {footer !== undefined && (
          <View style={[styles.footer, styles.gutter]}>{footer}</View>
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

export function LoadingScreen({ label = 'Loading' }: { label?: string }) {
  return (
    <Screen contentStyle={styles.skeleton}>
      <View accessibilityLabel={label} style={styles.skeleton}>
        <SkeletonLine width={40} height={40} radius={radius.pill} />
        <SkeletonLine width="70%" height={26} radius={8} />
        <SkeletonLine width="40%" height={14} radius={6} />
        <SkeletonCard height={160} radius={radius.lg} />
        <SkeletonCard height={96} radius={radius.lg} />
        <SkeletonCard height={96} radius={radius.lg} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  gutter: {
    paddingHorizontal: space.gutter,
  },
  scrollContent: {
    paddingTop: space[5],
    paddingBottom: space[9],
    flexGrow: 1,
  },
  footer: {
    paddingTop: space[3],
    paddingBottom: space[5],
    gap: space[3],
  },
  skeleton: {
    gap: space[4],
    paddingTop: space[3],
  },
});
