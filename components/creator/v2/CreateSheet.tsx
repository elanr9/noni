// The Create tab's sheet (V2Library.jsx CreateSheetScreen): three rows float
// above the tab bar; the scrim fades and the rows slide up on the sheet curve.
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, motion, radius, shadow, text, tone as tones, type Tone } from '../../../theme/v2';
import { Icon, Press, tabBarHeight, type IconName } from '../../v2';

export type CreateChoice = 'library' | 'record' | 'briefs';

export interface CreateSheetProps {
  onPick: (choice: CreateChoice) => void;
  onClose: () => void;
}

const ROWS: { key: CreateChoice; icon: IconName; tone: Tone; label: string; sub: string }[] = [
  { key: 'library', icon: 'photo_library', tone: 'purple', label: 'Upload from library', sub: 'Pick a video you already shot' },
  { key: 'record', icon: 'videocam', tone: 'blue', label: 'Start recording', sub: 'Film a post from scratch' },
  { key: 'briefs', icon: 'bookmark', tone: 'green', label: 'Briefs', sub: 'Guided posts and outlines from your team' },
];

export function CreateSheet({ onPick, onClose }: CreateSheetProps) {
  const insets = useSafeAreaInsets();
  const t = useSharedValue(0);
  const [h, setH] = useState(260);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    t.set(withTiming(1, { duration: 280, easing: motion.sheetEase }));
  }, [t]);

  const leave = (after: () => void) => {
    if (leaving) return;
    setLeaving(true);
    t.set(
      withTiming(0, { duration: 220, easing: motion.sheetEase }, (done) => {
        if (done) runOnJS(after)();
      }),
    );
  };

  const scrim = useAnimatedStyle(() => ({ opacity: t.get() }));
  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - t.get()) * (h + 120) }] }));

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(16,24,40,0.45)' }, scrim]}>
        <Pressable accessibilityLabel="Close" style={{ flex: 1 }} onPress={() => leave(onClose)} />
      </Animated.View>
      <Animated.View onLayout={(e) => setH(e.nativeEvent.layout.height)} style={[{ position: 'absolute', left: 12, right: 12, bottom: tabBarHeight(insets.bottom) + 44, gap: 10 }, sheet]}>
        {ROWS.map((r) => {
          const tn = tones[r.tone];
          return (
            <Press key={r.key} accessibilityRole="button" accessibilityLabel={r.label} onPress={() => leave(() => onPick(r.key))} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, backgroundColor: color.card, borderRadius: radius.card, ...shadow.card }}>
              <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: tn.tint, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={r.icon} size={26} color={tn.fg} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={text.row}>{r.label}</Text>
                <Text style={[text.meta, { marginTop: 2 }]}>{r.sub}</Text>
              </View>
              <Icon name="chevron_right" size={22} color={color.grey3} />
            </Press>
          );
        })}
      </Animated.View>
    </View>
  );
}
