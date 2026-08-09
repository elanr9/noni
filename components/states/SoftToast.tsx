import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, motion, radius, shadow, space, type } from '../../theme/tokens';
import { Icon, type IconName } from '../ui/Icon';

export type SoftToastTone = 'error' | 'success' | 'info';

export interface SoftToastProps {
  visible: boolean;
  message: string;
  tone?: SoftToastTone;
  /** Auto-hide delay. Defaults to motion.slow * 4 (~1680ms) plus hold. */
  durationMs?: number;
  onHide?: () => void;
}

const TONE: Record<
  SoftToastTone,
  { bg: string; fg: string; icon: IconName }
> = {
  error: { bg: color.dangerSoft, fg: color.danger, icon: 'circle-alert' },
  success: { bg: color.greenSoft, fg: color.green, icon: 'circle-check-big' },
  info: { bg: color.blue100, fg: color.blue700, icon: 'bell' },
};

/** Soft failure / success toast. Does not block the screen. */
export function SoftToast({
  visible,
  message,
  tone = 'error',
  durationMs = 2600,
  onHide,
}: SoftToastProps) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;
  const palette = TONE[tone];

  useEffect(() => {
    if (!visible || message.length === 0) {
      opacity.setValue(0);
      translateY.setValue(8);
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: motion.base,
        easing: motion.easeOut,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: motion.base,
        easing: motion.easeOut,
        useNativeDriver: true,
      }),
    ]).start();

    const t = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: motion.fast,
        easing: motion.easeOut,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onHide?.();
      });
    }, durationMs);

    return () => clearTimeout(t);
  }, [visible, message, durationMs, opacity, translateY, onHide]);

  if (!visible || message.length === 0) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        shadow.shadowFloat,
        {
          opacity,
          transform: [{ translateY }],
          bottom: Math.max(insets.bottom, space[4]) + space.tapPrimary + space[5],
        },
      ]}
    >
      <View style={[styles.card, { backgroundColor: palette.bg }]}>
        <Icon name={palette.icon} size={18} color={palette.fg} />
        <Text style={[styles.text, { color: palette.fg }]} numberOfLines={3}>
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: space.gutter,
    right: space.gutter,
    zIndex: 50,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingVertical: space[4],
    paddingHorizontal: space[5],
    borderRadius: radius.lg,
  },
  text: {
    flex: 1,
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.body,
    fontWeight: type.weight.semibold,
  },
});
