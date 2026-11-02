import { Text, type StyleProp, type ViewStyle } from 'react-native';

import type { PostAudio } from '../../../../lib/brief-library';
import { color, radius } from '../../../../theme/v2';
import { Icon, Press } from '../../../v2';

/** Marquee chip over the video, like the one at the bottom of a reel: music note, "title · artist" on a dark 50% pill. */
export function AudioChip({ audio, onPress, light, style }: { audio: PostAudio | null | undefined; onPress?: () => void; light?: boolean; style?: StyleProp<ViewStyle> }) {
  if (!audio?.track) return null;
  const t = audio.track;
  const fg = light ? color.ink : color.white;
  return (
    <Press onPress={onPress} disabled={!onPress} accessibilityRole="button" accessibilityLabel={`Sound: ${t.title} by ${t.artist}`} style={[{ height: 28, paddingLeft: 8, paddingRight: 10, borderRadius: radius.pill, backgroundColor: light ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.5)', flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 200 }, style]}>
      <Icon name="music_note" size={14} color={fg} />
      <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 28, fontWeight: '600', color: fg, flexShrink: 1 }}>{`${t.title} · ${t.artist}`}</Text>
    </Press>
  );
}
