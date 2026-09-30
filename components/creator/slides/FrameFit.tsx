// Fills its parent and centres a child box that is exactly 9:16, the largest
// that fits. The child gets the true 1080x1920 frame scaled down.
import { useState, type JSX, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { fitFrame } from './frame';

export function FrameFit(props: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  frameStyle?: StyleProp<ViewStyle>;
  /** Width over height; defaults to the 9:16 frame. */
  aspect?: number;
}): JSX.Element {
  const { children, style, frameStyle, aspect } = props;
  const [box, setBox] = useState({ w: 0, h: 0 });
  const frame = fitFrame(box.w, box.h, aspect);

  return (
    <View
      style={[styles.root, style]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setBox({ w: width, h: height });
      }}
    >
      {frame.width > 0 ? (
        <View style={[{ width: frame.width, height: frame.height }, frameStyle]}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
