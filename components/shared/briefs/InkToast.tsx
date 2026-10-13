// Prototype toast (SSManager / SSCreator shells): ink pill, white 600 14px
// text, leading icon, radius 16, 20pt side gutters, 40pt from the bottom,
// noni-toast-in (14pt rise, 0.98 scale) over motion.base, gone after 2200ms.

import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, motion, shadow, type as typeToken } from '../../../theme/tokens';
import { Icon, type IconName } from '../../ui/Icon';

export interface InkToastProps {
  visible: boolean;
  message: string;
  icon?: IconName;
  durationMs?: number;
  onHide?: () => void;
}

export function InkToast({ visible, message, icon = 'check', durationMs = 2200, onHide }: InkToastProps) {
  const insets = useSafeAreaInsets();
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!visible || message.length === 0) {
      progress.setValue(0);
      return;
    }
    Animated.timing(progress, {
      toValue: 1,
      duration: motion.base,
      easing: motion.easeOut,
      useNativeDriver: true,
    }).start();
    const t = setTimeout(() => {
      Animated.timing(progress, {
        toValue: 0,
        duration: motion.fast,
        easing: motion.easeOut,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onHide?.();
      });
    }, durationMs);
    return () => clearTimeout(t);
  }, [visible, message, durationMs, progress, onHide]);

  if (!visible || message.length === 0) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        shadow.shadowFloat,
        {
          bottom: 40 + insets.bottom,
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) },
          ],
        },
      ]}
    >
      <View style={styles.card}>
        <Icon name={icon} size={16} color={color.white} />
        <Text style={styles.text} numberOfLines={2}>
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 20, right: 20, zIndex: 90 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: color.ink,
  },
  text: { flex: 1, fontFamily: typeToken.font.ui, fontWeight: '600', fontSize: 14, color: color.white },
});
