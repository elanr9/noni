import { useId } from 'react';
import { Image, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { usePostFrame } from '../../../../lib/v2-media';
import type { V2Post } from '../../../../lib/v2-posts';
import { typeGradient } from '../../../../theme/v2';

/** Gradient seed when a post has no frame yet. */
const SEEDS = Object.keys(typeGradient);

function seedFor(title: string): readonly [string, string] {
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return typeGradient[SEEDS[h % SEEDS.length]];
}

/** A post's media frame at any size; falls back to a gradient seeded by the title. */
export function PostFrame({ post, width, height, radius = 10, style }: { post: Pick<V2Post, 'mediaPath' | 'mediaFormat' | 'title'>; width: number | `${number}%`; height: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const uri = usePostFrame(post);
  const id = useId();
  const [a, b] = seedFor(post.title);
  return (
    <View style={[{ width, height, borderRadius: radius, overflow: 'hidden', backgroundColor: '#1A1A1F' }, style]}>
      {uri ? (
        <Image source={{ uri }} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
      ) : (
        <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 1 1" style={{ position: 'absolute', top: 0, left: 0 }}>
          <Defs>
            <LinearGradient id={id} x1={0} y1={0} x2={1} y2={1}>
              <Stop offset="0" stopColor={a} />
              <Stop offset="1" stopColor={b} />
            </LinearGradient>
          </Defs>
          <Rect width={1} height={1} fill={`url(#${id})`} />
        </Svg>
      )}
    </View>
  );
}
