// Round platform badge for the setup screens: the TikTok glyph on ink, the
// Instagram glyph on the brand gradient.
import { View } from 'react-native';

import { color, radius } from '../../../../theme/v2';
import { InstagramFill, InstagramMark, TikTokMark } from '../../../v2';

export type SetupPlatform = 'instagram' | 'tiktok';

export function PlatformBadge({ platform, size = 40 }: { platform: SetupPlatform; size?: number }) {
  const glyph = Math.round(size * 0.48);
  if (platform === 'instagram') {
    return (
      <InstagramFill radius={radius.pill} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <InstagramMark size={glyph} />
      </InstagramFill>
    );
  }
  return (
    <View style={{ width: size, height: size, borderRadius: radius.pill, backgroundColor: color.ink, alignItems: 'center', justifyContent: 'center' }}>
      <TikTokMark size={glyph} />
    </View>
  );
}
