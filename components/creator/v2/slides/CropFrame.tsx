/* eslint-disable react-hooks/refs -- gesture closures read refs when the gesture fires, never during render */
// Crop step: the full 9:16 frame. Drag pans, pinch zooms, the photo always
// covers the frame, and a rule-of-thirds grid sits on top.
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { editor } from '../../../../theme/v2';
import { clampCrop, type Slide, type SlideCrop } from './model';
import { SlideFrame } from './SlideFrame';

export function CropFrame({ slide, width, height, onChange }: { slide: Slide; width: number; height: number; onChange: (c: SlideCrop) => void }) {
  // Gesture handlers read these when the gesture runs, not during render.
  const start = useRef<SlideCrop>(slide.crop ?? { z: 1, x: 0, y: 0 });
  const live = useRef<SlideCrop>(slide.crop ?? { z: 1, x: 0, y: 0 });
  useEffect(() => {
    live.current = slide.crop ?? { z: 1, x: 0, y: 0 };
  }, [slide.crop]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onStart(() => {
          start.current = live.current;
        })
        .onUpdate((e) => {
          const s = start.current;
          onChange(clampCrop({ ...s, x: s.x + ((e.translationX / width) * 100) / s.z, y: s.y + ((e.translationY / height) * 100) / s.z }));
        }),
    [width, height, onChange],
  );
  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .onStart(() => {
          start.current = live.current;
        })
        .onUpdate((e) => onChange(clampCrop({ ...start.current, z: start.current.z * e.scale }))),
    [onChange],
  );
  const gesture = Gesture.Simultaneous(pan, pinch);
  const lines = [1, 2];
  return (
    <GestureDetector gesture={gesture}>
      <View style={{ width, height, backgroundColor: editor.black }}>
        <SlideFrame slide={slide} width={width} height={height} />
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {lines.map((i) => (
            <View key={`h${i}`} style={{ position: 'absolute', left: 0, right: 0, top: (height * i) / 3, height: 1, backgroundColor: editor.w18 }} />
          ))}
          {lines.map((i) => (
            <View key={`v${i}`} style={{ position: 'absolute', top: 0, bottom: 0, left: (width * i) / 3, width: 1, backgroundColor: editor.w18 }} />
          ))}
        </View>
      </View>
    </GestureDetector>
  );
}
