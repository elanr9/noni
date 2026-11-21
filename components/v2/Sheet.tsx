import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { useKeyboardHeight } from '../../lib/keyboard';
import { color, motion, radius, shadow, text } from '../../theme/v2';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Buttons in a row, gap 8, 16 above. */
  footer?: ReactNode;
}

/** Drag past this, or flick down, to close. */
const CLOSE_DRAG = 90;

/** Bottom sheet: white, r20 top, float shadow, padding 12 20 34, 36x4 grabber, scrim behind. 320ms on the sheet curve. */
export function Sheet({ open, onClose, title, children, footer }: SheetProps) {
  const { height } = useWindowDimensions();
  const keyboard = useKeyboardHeight();
  const [shown, setShown] = useState(open);
  const progress = useSharedValue(0);
  const drag = useSharedValue(0);
  const panelH = useSharedValue(height);

  if (open && !shown) setShown(true);

  useEffect(() => {
    const timing = { duration: motion.sheet, easing: motion.sheetEase };
    if (open) {
      drag.set(0);
      progress.set(withTiming(1, timing));
    } else {
      progress.set(
        withTiming(0, timing, (done) => {
          if (done) runOnJS(setShown)(false);
        }),
      );
    }
  }, [open, progress, drag]);

  const pan = Gesture.Pan()
    .activeOffsetY(6)
    .onUpdate((e) => {
      drag.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      if (e.translationY > CLOSE_DRAG || e.velocityY > 600) runOnJS(onClose)();
      else drag.set(withSpring(0, { ...motion.settle, velocity: e.velocityY }));
    });

  const scrim = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const panel = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.get()) * panelH.get() + drag.get() }],
  }));

  if (!shown) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: keyboard }}>
        <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: color.scrim }, scrim]}>
          <Pressable accessibilityLabel="Close" style={{ flex: 1 }} onPress={onClose} />
        </Animated.View>
        <Animated.View
          onLayout={(e) => {
            panelH.set(e.nativeEvent.layout.height);
          }}
          style={[
            {
              backgroundColor: color.card,
              borderTopLeftRadius: radius.sheet,
              borderTopRightRadius: radius.sheet,
              paddingTop: 12,
              paddingHorizontal: 20,
              paddingBottom: keyboard ? 12 : 34,
              maxHeight: height * 0.86,
              ...shadow.float,
            },
            panel,
          ]}
        >
          <GestureDetector gesture={pan}>
            <View style={{ paddingBottom: 16, marginTop: -12, paddingTop: 12 }}>
              <View style={{ width: 36, height: 4, borderRadius: radius.pill, backgroundColor: color.grey2, alignSelf: 'center' }} />
              {title ? <Text style={[text.card, { fontSize: 24, lineHeight: 30, marginTop: 16 }]}>{title}</Text> : null}
            </View>
          </GestureDetector>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 1 }}>
            {children}
          </ScrollView>
          {footer ? <View style={{ flexDirection: 'row', gap: 8, paddingTop: 16 }}>{footer}</View> : null}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}
