import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardHeight } from '../../lib/keyboard';
import { color, motion, radius, shadow } from '../../theme/tokens';

export interface SheetShellProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Pins the panel top this far from the top of the screen (tall sheets); content scrolls. */
  pinnedTop?: number;
  /** Pinned below the scroll area (e.g. Save / Remove footers). */
  footer?: ReactNode;
}

/** Generic bottom sheet: scrim + slide-up panel with grabber, 240ms ease-out. */
export function SheetShell({
  visible,
  onClose,
  children,
  pinnedTop,
  footer,
}: SheetShellProps) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const [shown, setShown] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setShown(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: motion.base,
        easing: motion.easeOut,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(progress, {
        toValue: 0,
        duration: motion.base,
        easing: motion.easeOut,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setShown(false);
      });
    }
  }, [visible, progress]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [height, 0],
  });

  // The panel sits above the keyboard and never grows past the top safe area.
  const available = height - keyboardHeight - insets.top;
  const panelSize =
    pinnedTop !== undefined
      ? { height: Math.min(height - pinnedTop, available) }
      : { maxHeight: Math.min(height * 0.9, available) };

  return (
    <Modal visible={shown} transparent statusBarTranslucent animationType="none">
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: progress }]}>
          <Pressable
            accessibilityLabel="Close sheet"
            style={StyleSheet.absoluteFill}
            onPress={onClose}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.panel,
            shadow.shadowRaised,
            panelSize,
            { marginBottom: keyboardHeight, transform: [{ translateY }] },
          ]}
        >
          <View style={styles.grabberWrap}>
            <View style={styles.grabber} />
          </View>
          <ScrollView
            contentContainerStyle={[styles.content, footer ? styles.contentWithFooter : null]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: color.sheetScrim,
  },
  panel: {
    backgroundColor: color.white,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    paddingTop: 14,
  },
  grabberWrap: {
    alignItems: 'center',
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: color.lineStrong,
  },
  content: {
    paddingTop: 14,
    paddingHorizontal: 24,
    paddingBottom: 30,
  },
  contentWithFooter: {
    paddingBottom: 16,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 30,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
    gap: 8,
  },
});
