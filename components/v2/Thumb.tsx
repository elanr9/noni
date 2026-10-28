import { useId, useState } from 'react';
import { Image, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { radius as radii, typeGradient } from '../../theme/v2';

export interface ThumbPost {
  /** Extracted frame or cover image. */
  frame?: string | null;
  /** Post type label (typeGradient key) for the no-frame fallback. */
  type?: string | null;
  title?: string | null;
  format?: 'Reel' | 'Slideshow' | null;
}

export interface ThumbProps {
  post: ThumbPost;
  /** Width; height is 11/8 of it. */
  w?: number;
  radius?: number;
  /** Slideshows fan their first three slides. */
  fan?: boolean;
  style?: StyleProp<ViewStyle>;
}

const FAN = [
  { r: -8, x: -5, o: 0.55, deg: 120 },
  { r: 5, x: 4, o: 0.75, deg: 200 },
  { r: 0, x: 0, o: 1, deg: 160 },
] as const;

/** CSS linear-gradient angle to SVG gradient end points in a unit box. */
function ends(deg: number) {
  const a = (deg * Math.PI) / 180;
  const dx = Math.sin(a) / 2;
  const dy = -Math.cos(a) / 2;
  return { x1: 0.5 - dx, y1: 0.5 - dy, x2: 0.5 + dx, y2: 0.5 + dy };
}

function Face({ post, w, h, r, deg, showTitle }: { post: ThumbPost; w: number; h: number; r: number; deg: number; showTitle: boolean }) {
  const [broken, setBroken] = useState(false);
  const id = useId();
  if (post.frame && !broken) {
    return <Image source={{ uri: post.frame }} onError={() => setBroken(true)} resizeMode="cover" style={{ width: w, height: h, borderRadius: r }} />;
  }
  const [a, b] = typeGradient[post.type ?? ''] ?? typeGradient.Anything;
  const fs = Math.max(9, Math.round(w / 6.4));
  const pad = Math.round(w / 9);
  return (
    <View style={{ width: w, height: h, borderRadius: r, overflow: 'hidden', justifyContent: 'flex-end', padding: pad }}>
      <Svg width={w} height={h} style={{ position: 'absolute', top: 0, left: 0 }}>
        <Defs>
          <LinearGradient id={id} {...ends(deg)}>
            <Stop offset="0" stopColor={a} />
            <Stop offset="1" stopColor={b} />
          </LinearGradient>
        </Defs>
        <Rect width={w} height={h} fill={`url(#${id})`} />
      </Svg>
      {showTitle && post.title && w >= 40 ? (
        <Text numberOfLines={3} style={{ fontSize: fs, lineHeight: Math.round(fs * 1.2), fontWeight: '700', color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.25)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }}>
          {post.title}
        </Text>
      ) : null}
    </View>
  );
}

/** 8:11 frame, r10. Falls back to the post type gradient with the title in white. */
export function Thumb({ post, w = 64, radius = radii.thumb, fan, style }: ThumbProps) {
  const h = Math.round((w * 11) / 8);
  if (fan && post.format === 'Slideshow') {
    return (
      <View style={[{ width: w, height: h, flexShrink: 0 }, style]}>
        {FAN.map((s, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              opacity: s.o,
              borderRadius: radius,
              transform: [{ translateX: s.x }, { rotate: `${s.r}deg` }],
              boxShadow: '0 2px 6px rgba(16,24,40,0.15)',
            }}
          >
            <Face post={post} w={w} h={h} r={radius} deg={s.deg} showTitle={i === 2} />
          </View>
        ))}
      </View>
    );
  }
  return (
    <View style={[{ width: w, height: h, flexShrink: 0 }, style]}>
      <Face post={post} w={w} h={h} r={radius} deg={160} showTitle />
    </View>
  );
}
