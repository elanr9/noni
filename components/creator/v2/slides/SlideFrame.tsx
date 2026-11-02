import type { ReactNode } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { GradientFill, MediaFill } from '../../../admin/v2/newbrief/ClipFrame';
import { StTextView } from '../../../v2/StTextView';
import { slideDoc, type Slide } from './model';

/** The slide as TikTok shows it: photo zoomed and panned by its crop, text in place. */
export function SlideFrame({ slide, width, height, radius = 0, texts = true, style, children }: { slide: Slide; width: number; height: number; radius?: number; texts?: boolean; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const c = slide.crop ?? { z: 1, x: 0, y: 0 };
  const doc = slideDoc(slide);
  return (
    <View style={[{ width, height, borderRadius: radius, overflow: 'hidden', backgroundColor: '#1A1A1F' }, style]}>
      {slide.photo ? (
        <Image source={{ uri: slide.photo.uri }} resizeMode="cover" style={[StyleSheet.absoluteFill, { transform: [{ translateX: (c.x / 100) * width }, { translateY: (c.y / 100) * height }, { scale: c.z }] }]} />
      ) : (
        <GradientFill colors={['#2B2B31', '#1A1A1F']} deg={180} />
      )}
      {texts
        ? doc.overlays.map((o) => {
            const w = (o.w / 100) * width;
            const h = w * 1.25;
            return (
              <View key={o.id} style={{ position: 'absolute', left: (o.x / 100) * width - w / 2, top: (o.y / 100) * height - h / 2, width: w, height: h, overflow: 'hidden' }}>
                <MediaFill src={o.src} />
              </View>
            );
          })
        : null}
      {texts ? doc.texts.map((x) => <StTextView key={x.id} x={x} width={width} height={height} />) : null}
      {children}
    </View>
  );
}
