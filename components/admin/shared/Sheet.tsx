import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, motion, radius, shadow, space } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  /** Header with the circled x renders only when a title is given. */
  title?: string;
  subtitle?: string;
  /** Scrollable body. */
  children: ReactNode;
  /** Sticky below the scroll area, e.g. Cancel / Send back. */
  footer?: ReactNode;
  /** Pins the panel top this far from the top of the screen (tall sheets). */
  pinnedTop?: number;
}

/**
 * Admin handoff — bottom sheet: grabber, title/subtitle header with a circled
 * x, scrollable body, sticky footer. 240ms rise, scrim fades with it.
 */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  pinnedTop,
}: SheetProps) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
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

  return (
    <Modal visible={shown} transparent statusBarTranslucent animationType="none">
      <View style={styles.root}>
        <Animated.View style={[styles.scrim, { opacity: progress }]}>
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
            pinnedTop !== undefined
              ? { height: height - pinnedTop }
              : { maxHeight: height * 0.84 },
            {
              paddingBottom: Math.max(insets.bottom, 24),
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={styles.grabberWrap}>
            <View style={styles.grabber} />
          </View>

          {title !== undefined && (
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.title}>{title}</Text>
                {subtitle !== undefined && <Text style={styles.subtitle}>{subtitle}</Text>}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={6}
                onPress={onClose}
                style={styles.close}
              >
                <Icon name="x" size={17} color={color.slate500} />
              </Pressable>
            </View>
          )}

          <ScrollView
            contentContainerStyle={[styles.body, title === undefined && styles.bodyNoHeader]}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>

          {footer !== undefined && <View style={styles.footer}>{footer}</View>}
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
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: color.scrim,
  },
  panel: {
    backgroundColor: color.white,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
  },
  grabberWrap: {
    alignItems: 'center',
    paddingTop: 10,
  },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: color.lineStrong,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: space.gutterAdmin,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: color.ink,
  },
  subtitle: {
    marginTop: 5,
    fontSize: 14,
    lineHeight: 14 * 1.45,
    color: color.slate500,
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: space.gutterAdmin,
    flexGrow: 0,
  },
  bodyNoHeader: {
    paddingTop: 14,
  },
  footer: {
    paddingTop: 12,
    paddingHorizontal: space.gutterAdmin,
  },
});
