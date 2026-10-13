// One 9:16 slide at any width, from SSShared.jsx SlideCard. Solid is the
// manager's slide, dashed is the creator's. Text renders as the white box
// TikTok draws; under 70pt wide it collapses to bars. Real photos when the
// creator has picked one, the toned gradient only as the fallback.
import { useState, type JSX, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import type { LibraryFeature } from '../../../lib/library-api';
import { briefTone, color, shadow, type as typeToken } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { photoLayout, type PhotoCrop } from '../slides/photo-crop';
import { FeatureShot } from './FeatureShot';
import { layoutOf, type CreatorSlide } from './model';

export const SLIDE_RATIO = 16 / 9;

export type MiniSlideProps = {
  w: number;
  text?: string;
  photoUri?: string | null;
  photoCrop?: PhotoCrop;
  feature?: LibraryFeature | null;
  layout?: Pick<CreatorSlide, 'box' | 'insetBox' | 'boxIg' | 'insetBoxIg' | 'insetFeatureId'>;
  textScale?: number;
  who?: 'manager' | 'creator' | 'mixed';
  label?: string;
  index?: number;
  selected?: boolean;
  dim?: boolean;
  /** No radius, border or shadow: fills a parent frame. */
  bare?: boolean;
  video?: boolean;
  onPress?: () => void;
  children?: ReactNode;
};

/** A child centred on a frame point (x, y as fractions), measured so it never needs a known height. */
function CenteredAt({ x, y, width, frameWidth, children }: { x: number; y: number; width: number; frameWidth: number; children: ReactNode }): JSX.Element {
  const [h, setH] = useState(0);
  return (
    <View
      pointerEvents="none"
      onLayout={(e) => setH(e.nativeEvent.layout.height)}
      style={{ position: 'absolute', left: x * frameWidth - width / 2, top: `${y * 100}%`, width, marginTop: -h / 2, alignItems: 'center' }}
    >
      {children}
    </View>
  );
}

export function MiniSlide(props: MiniSlideProps): JSX.Element {
  const {
    w,
    text,
    photoUri,
    photoCrop,
    feature,
    layout,
    textScale = 1,
    who = 'manager',
    label,
    index,
    selected = false,
    dim = false,
    bare = false,
    video = false,
    onPress,
    children,
  } = props;
  const h = Math.round(w * SLIDE_RATIO);
  const creator = who !== 'manager';
  const fs = Math.max(8, Math.round(w * 0.072 * textScale));
  const L = layoutOf(layout ?? { insetFeatureId: feature ? feature.id : null }, 'tiktok');
  const radius = bare ? 0 : w * 0.11;

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={index !== undefined ? `Slide ${index + 1}` : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.root,
        { width: w, height: h, borderRadius: radius, opacity: dim ? 0.55 : 1 },
        !bare && (creator ? styles.creatorBorder : styles.managerBorder),
        !bare && shadow.shadowCard,
        selected && !bare ? { borderWidth: 3, borderColor: color.blue500, borderStyle: 'solid' } : null,
        creator ? { backgroundColor: briefTone.creatorStripe[0] } : null,
      ]}
    >
      {photoUri ? (
        <Image
          source={{ uri: photoUri }}
          style={photoCrop ? [styles.absPhoto, photoLayout(photoCrop, w, h)] : StyleSheet.absoluteFill}
          resizeMode={photoCrop ? 'stretch' : 'cover'}
        />
      ) : !creator ? (
        <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="ms" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={briefTone.managerSlide[0]} />
              <Stop offset="0.55" stopColor={color.slate400} />
              <Stop offset="1" stopColor={briefTone.managerSlide[1]} />
            </LinearGradient>
          </Defs>
          <Rect width={w} height={h} fill="url(#ms)" />
        </Svg>
      ) : null}

      {who === 'creator' && !photoUri ? (
        <View style={styles.creatorBody} pointerEvents="none">
          <Icon name="camera" size={Math.round(w * 0.17)} color={color.slate300} />
          {w >= 110 && label ? (
            <Text style={[styles.creatorLabel, { fontSize: Math.round(w * 0.075), paddingHorizontal: w * 0.1 }]}>{label}</Text>
          ) : null}
        </View>
      ) : null}

      {feature ? (
        <CenteredAt x={L.inset.x} y={L.inset.y} width={w * L.inset.w} frameWidth={w}>
          <FeatureShot feature={feature} w={w * L.inset.w} video={video} />
        </CenteredAt>
      ) : null}

      {text ? (
        <CenteredAt x={L.text.x} y={L.text.y} width={w * L.text.w} frameWidth={w}>
          {w <= 70 ? (
            <View style={[styles.barsBox, { borderRadius: w * 0.06, paddingVertical: w * 0.06, paddingHorizontal: w * 0.07, gap: w * 0.035 }]}>
              {[1, 0.8, 0.55].slice(0, Math.min(3, Math.ceil(text.length / 18))).map((f) => (
                <View key={f} style={[styles.bar, { height: Math.max(2, w * 0.045), width: `${f * 100}%` }]} />
              ))}
            </View>
          ) : (
            <Text
              style={[
                styles.text,
                { fontSize: fs, lineHeight: Math.round(fs * 1.22), borderRadius: w * 0.05, paddingVertical: w * 0.035, paddingHorizontal: w * 0.055 },
              ]}
            >
              {text}
            </Text>
          )}
        </CenteredAt>
      ) : null}

      {index !== undefined ? (
        <View
          style={[
            styles.badge,
            creator ? styles.badgeCreator : styles.badgeManager,
            { top: w * 0.06, left: w * 0.06, minWidth: w * 0.16, height: w * 0.16, paddingHorizontal: w * 0.04 },
          ]}
        >
          <Text style={[styles.badgeText, { fontSize: Math.round(w * 0.085), color: creator ? color.slate500 : color.white }]}>{index + 1}</Text>
        </View>
      ) : null}
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden', backgroundColor: briefTone.canvas.bg },
  creatorBorder: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.lineStrong },
  managerBorder: { borderWidth: 1, borderColor: color.border },
  absPhoto: { position: 'absolute' },
  creatorBody: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 6 },
  creatorLabel: { fontFamily: typeToken.font.ui, fontWeight: '700', color: color.slate400, textAlign: 'center' },
  barsBox: { width: '100%', backgroundColor: color.white, ...shadow.shadowCard },
  bar: { borderRadius: 99, backgroundColor: color.ink },
  text: {
    backgroundColor: color.white,
    color: color.ink,
    fontFamily: typeToken.font.display,
    fontWeight: '800',
    textAlign: 'center',
    overflow: 'hidden',
  },
  badge: { position: 'absolute', borderRadius: 99, alignItems: 'center', justifyContent: 'center' },
  badgeManager: { backgroundColor: color.scrimStrong },
  badgeCreator: { backgroundColor: color.white, borderWidth: 1, borderColor: color.line },
  badgeText: { fontFamily: typeToken.font.ui, fontWeight: '800' },
});
