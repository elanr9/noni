import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Measuring the keyboard is more reliable than KeyboardAvoidingView, which
// infers the overlap from its own onLayout frame and gets it wrong once a
// SafeAreaView or a navigation header offsets the view. metrics() seeds the
// height for a screen that mounts with the keyboard open.
export function useKeyboardHeight(): number {
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

/**
 * Bottom padding for a container whose pinned bar already pads the bottom
 * safe area. The keyboard covers that area, so only the remainder is added.
 */
export function useKeyboardPadding(): number {
  const height = useKeyboardHeight();
  const insets = useSafeAreaInsets();
  return Math.max(0, height - insets.bottom);
}
