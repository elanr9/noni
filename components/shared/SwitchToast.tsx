import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

import { useCompany } from '../../lib/company-context';
import { color, motion, shadow } from '../../theme/tokens';
import { CompanyMark } from './CompanyMark';

/** Confirms the jump after switchTo resolves. The provider hides it after 2200ms. */
export function SwitchToast() {
  const { toast } = useCompany();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: toast ? 1 : 0,
      duration: motion.base,
      easing: motion.easeOut,
      useNativeDriver: true,
    }).start();
  }, [toast, progress]);

  if (!toast) return null;

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[
        styles.toast,
        shadow.shadowFloat,
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
          ],
        },
      ]}
    >
      <CompanyMark
        companyId={toast.companyId}
        name={toast.name}
        logoPath={toast.logoPath}
        size={26}
      />
      <Text style={styles.text} numberOfLines={1}>
        Now in {toast.name}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 100,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: color.ink,
    zIndex: 90,
  },
  text: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '600',
    color: color.white,
  },
});
