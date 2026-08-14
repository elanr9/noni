import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { color, motion, radius, shadow, type } from '../../theme/tokens';

/**
 * Creator toast (SCREENS §1): dark ink pill at bottom 104, springs up 240ms
 * ease-out, auto-dismisses after 2400ms. Wrap the creator stack with
 * CreatorToastProvider and call useCreatorToast().show(...) from any screen.
 */

const SHOW_MS = 2400;

type CreatorToastValue = {
  show: (message: string) => void;
};

const CreatorToastContext = createContext<CreatorToastValue | null>(null);

export function CreatorToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    };
  }, []);

  const show = useCallback(
    (msg: string) => {
      if (hideTimer.current !== null) clearTimeout(hideTimer.current);
      setMessage(msg);
      anim.setValue(0);
      Animated.timing(anim, {
        toValue: 1,
        duration: motion.base,
        easing: motion.easeOut,
        useNativeDriver: true,
      }).start();
      hideTimer.current = setTimeout(() => {
        Animated.timing(anim, {
          toValue: 0,
          duration: motion.fast,
          easing: motion.easeOut,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) setMessage(null);
        });
      }, SHOW_MS);
    },
    [anim],
  );

  const value = useMemo<CreatorToastValue>(() => ({ show }), [show]);

  return (
    <CreatorToastContext.Provider value={value}>
      {children}
      {message !== null && (
        <View style={styles.host} pointerEvents="none">
          <Animated.View
            style={[
              styles.pill,
              shadow.shadowFloat,
              {
                opacity: anim,
                transform: [
                  {
                    translateY: anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [16, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text style={styles.text} numberOfLines={2}>
              {message}
            </Text>
          </Animated.View>
        </View>
      )}
    </CreatorToastContext.Provider>
  );
}

export function useCreatorToast(): CreatorToastValue {
  const ctx = useContext(CreatorToastContext);
  if (ctx === null) {
    throw new Error('useCreatorToast must be used inside CreatorToastProvider');
  }
  return ctx;
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 104,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  pill: {
    maxWidth: '100%',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: color.ink,
  },
  text: {
    fontSize: 13.5,
    fontWeight: type.weight.semibold,
    color: color.white,
    textAlign: 'center',
  },
});
