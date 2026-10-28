import { useState } from 'react';
import { Image, Text, View } from 'react-native';

import { color, radius, tone as tones, type Tone } from '../../theme/v2';

export interface AvatarProps {
  name?: string;
  photo?: string | null;
  tone?: Tone;
  size?: number;
  ring?: boolean;
  online?: boolean;
  badge?: number;
}

/** Circle photo with a 3px tone ring (2px under 40). Falls back to an initial on the tint. */
export function Avatar({ name, photo, tone = 'blue', size = 48, ring = true, online, badge }: AvatarProps) {
  const [broken, setBroken] = useState(false);
  const t = tones[tone];
  const ringW = size > 40 ? 3 : 2;
  return (
    <View style={{ width: size, height: size, flexShrink: 0 }}>
      {ring ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: -ringW, left: -ringW, right: -ringW, bottom: -ringW, borderRadius: radius.pill, borderWidth: ringW, borderColor: t.fg }}
        />
      ) : null}
      <View style={{ width: size, height: size, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: t.tint, alignItems: 'center', justifyContent: 'center' }}>
        {photo && !broken ? (
          <Image source={{ uri: photo }} onError={() => setBroken(true)} resizeMode="cover" style={{ width: size, height: size }} />
        ) : (
          <Text allowFontScaling={false} style={{ fontSize: Math.round(size * 0.4), fontWeight: '700', color: t.fg }}>
            {(name || '?').charAt(0).toUpperCase()}
          </Text>
        )}
      </View>
      {online ? (
        <View style={{ position: 'absolute', right: -2, bottom: -2, width: 14, height: 14, borderRadius: radius.pill, backgroundColor: color.green, borderWidth: 2.5, borderColor: color.card }} />
      ) : null}
      {badge !== undefined ? (
        <View
          style={{
            position: 'absolute',
            right: -6,
            bottom: -6,
            minWidth: 26,
            height: 26,
            paddingHorizontal: 7,
            borderRadius: radius.pill,
            backgroundColor: t.fg,
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 0 0 2.5px ${color.card}`,
          }}
        >
          <Text style={{ fontSize: 13, lineHeight: 26, fontWeight: '700', color: color.white }}>{badge}</Text>
        </View>
      ) : null}
    </View>
  );
}
