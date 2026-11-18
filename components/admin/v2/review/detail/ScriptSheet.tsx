import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { color, motion, radius } from '../../../../../theme/v2';

export type ScriptSection = { kind: 'label'; label: string; text: string } | { kind: 'point'; n: number; text: string };

const SCRIM = 'rgba(0,0,0,0.35)';

export interface ScriptSheetProps {
  open: boolean;
  onClose: () => void;
  sections: ScriptSection[];
  /** Index into `sections` of the point playing now, or -1. */
  live: number;
}

/**
 * Slides up from the video band's bottom edge, clipped to the band: HOOK, the
 * numbered points (the one playing turns blue), CTA. Drag the grabber down or
 * tap the scrim to close.
 */
export function ScriptSheet({ open, onClose, sections, live }: ScriptSheetProps) {
  const [shown, setShown] = useState(open);
  const [h, setH] = useState(600);
  const p = useSharedValue(0);
  const drag = useSharedValue(0);
  if (open && !shown) setShown(true);

  useEffect(() => {
    drag.set(0);
    p.set(
      withTiming(open ? 1 : 0, { duration: motion.sheet, easing: motion.sheetEase }, (done) => {
        if (done && !open) runOnJS(setShown)(false);
      }),
    );
  }, [open, p, drag]);

  const pan = Gesture.Pan()
    .activeOffsetY(4)
    .onUpdate((e) => {
      drag.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      if (e.translationY > 40 || e.velocityY > 500) runOnJS(onClose)();
      else drag.set(withTiming(0, { duration: motion.push, easing: motion.ease }));
    });

  const scrim = useAnimatedStyle(() => ({ opacity: p.get() }));
  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - p.get()) * h + drag.get() }] }));

  if (!shown) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: SCRIM }, scrim]}>
        <Pressable accessibilityLabel="Close script" style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>
      <Animated.View onLayout={(e) => setH(e.nativeEvent.layout.height)} style={[styles.panel, panel]}>
        <GestureDetector gesture={pan}>
          <View style={styles.grabArea}>
            <View style={styles.grabber} />
          </View>
        </GestureDetector>
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {sections.length === 0 ? <Text style={styles.empty}>This post has no script. The creator filmed it freely.</Text> : null}
          {sections.map((s, i) =>
            s.kind === 'label' ? (
              <View key={i} style={styles.block}>
                <Text style={styles.label}>{s.label}</Text>
                <Text style={[styles.text, { marginTop: 4 }]}>{s.text}</Text>
              </View>
            ) : (
              <View key={i} style={[styles.block, styles.pointRow]}>
                <View style={[styles.num, i === live && { backgroundColor: color.blue }]}>
                  <Text style={[styles.numText, i === live && { color: color.white }]}>{s.n}</Text>
                </View>
                <Text style={[styles.text, { flex: 1 }, i === live && { color: color.blueDeep, fontWeight: '600' }]}>{s.text}</Text>
              </View>
            ),
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '100%', backgroundColor: color.card, borderTopLeftRadius: radius.sheetLg, borderTopRightRadius: radius.sheetLg },
  grabArea: { paddingTop: 10, paddingBottom: 6, alignItems: 'center' },
  grabber: { width: 40, height: 5, borderRadius: radius.pill, backgroundColor: color.grey2 },
  body: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 20 },
  block: { paddingVertical: 7 },
  pointRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  label: { fontSize: 13, lineHeight: 16, fontWeight: '600', color: color.grey4, textTransform: 'uppercase', letterSpacing: 0.4 },
  text: { fontSize: 15, lineHeight: 21, color: color.ink },
  num: { width: 24, height: 24, borderRadius: radius.pill, backgroundColor: color.grey1, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  numText: { fontSize: 13, fontWeight: '700', color: color.grey4 },
  empty: { fontSize: 15, lineHeight: 20, color: color.grey4, paddingVertical: 12 },
});
