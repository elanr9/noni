import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { color, motion, space, type } from '../../theme/tokens';

// The footer is pinned to the bottom of the screen, so an open keyboard would
// cover it. Some keyboards (the number pad on the phone step) have no return
// key, which leaves no way to reach the CTA at all. Measuring the keyboard is
// more reliable than KeyboardAvoidingView, which infers the overlap from its
// own onLayout frame and gets it wrong once a SafeAreaView insets the view.
// metrics() seeds the height for a screen that mounts with the keyboard open.
function useKeyboardHeight(): number {
  const [height, setHeight] = useState(() =>
    typeof Keyboard.metrics === 'function' ? (Keyboard.metrics()?.height ?? 0) : 0,
  );

  useEffect(() => {
    const shown = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow',
      (event) => setHeight(event.endCoordinates?.height ?? 0),
    );
    const hidden = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setHeight(0),
    );

    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  return height;
}

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
    <Screen contentStyle={styles.center}>
      <ActivityIndicator size="large" color={color.accent} />
      <Text style={styles.muted}>{label}</Text>
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
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[3],
  },
  muted: {
    fontSize: type.size.body,
    lineHeight: type.size.body * type.leading.body,
    color: color.textMuted,
  },
});
