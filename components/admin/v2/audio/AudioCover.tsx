import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';

import type { AudioTrack } from '../../../../lib/brief-library';
import { coverColors, trackKind } from '../../../../lib/audio-library';
import { Icon } from '../../../v2';
import { GradientFill } from '../newbrief/ClipFrame';

/** Cover tile: 145deg gradient, music or equaliser icon; four bouncing bars while playing. */
export function AudioCover({ t, size = 48, playing }: { t: AudioTrack; size?: number; playing?: boolean }) {
  const c = coverColors(t);
  return (
    <View style={{ width: size, height: size, borderRadius: size > 60 ? 16 : 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      <GradientFill colors={c} deg={145} />
      {playing ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: size * 0.4 }}>
          {[0, 1, 2, 3].map((i) => (
            <Bar key={i} i={i} h={size * 0.4} />
          ))}
        </View>
      ) : (
        <Icon name={trackKind(t) === 'original' ? 'graphic_eq' : 'music_note'} size={size * 0.46} color="rgba(255,255,255,0.92)" />
      )}
    </View>
  );
}

function Bar({ i, h }: { i: number; h: number }) {
  const s = useSharedValue(0.25);
  useEffect(() => {
    s.set(withDelay(i * 80, withRepeat(withTiming(1, { duration: 600 + i * 130, easing: Easing.inOut(Easing.ease) }), -1, true)));
  }, [s, i]);
  const a = useAnimatedStyle(() => ({ transform: [{ scaleY: s.get() }] }));
  return <Animated.View style={[{ width: 3, height: h, borderRadius: 2, backgroundColor: '#FFFFFF', transformOrigin: 'bottom' }, a]} />;
}
