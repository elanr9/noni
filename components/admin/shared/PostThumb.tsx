import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { color, radiusAdmin } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';

export interface PostThumbProps {
  /** Real thumbnail — Reel first frame or slide 1. Gradient fallback when missing. */
  uri?: string | null;
  width: number;
  height: number;
  format: 'video' | 'photo_carousel';
  /** Bottom-left media badge: duration for Reels, slide count for Slideshows. */
  badge?: string;
  /** Top-left amber badge when attempt > 1, e.g. "Take 2". */
  takeBadge?: string;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Admin handoff §1 media rule — fixed box, cover fit, badges live on the
 * media, blue gradient with a format glyph as the missing-asset fallback.
 */
export function PostThumb({
  uri,
  width,
  height,
  format,
  badge,
  takeBadge,
  radius = radiusAdmin.md,
  style,
}: PostThumbProps) {
  return (
    <View style={[styles.box, { width, height, borderRadius: radius }, style]}>
      {uri ? (
        <Image source={{ uri }} resizeMode="cover" style={StyleSheet.absoluteFill} />
      ) : (
        <>
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="noniPostThumb" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0" stopColor={color.blue200} />
                <Stop offset="1" stopColor={color.blue400} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#noniPostThumb)" />
          </Svg>
          <View style={styles.glyph}>
            <Icon
              name={format === 'video' ? 'play' : 'images'}
              size={Math.min(18, width * 0.32)}
              color={color.whiteA92}
            />
          </View>
        </>
      )}

      {takeBadge !== undefined && (
        <Text style={[styles.badge, styles.takeBadge]} numberOfLines={1}>
          {takeBadge}
        </Text>
      )}
      {badge !== undefined && (
        <Text style={[styles.badge, styles.mediaBadge]} numberOfLines={1}>
          {badge}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    overflow: 'hidden',
    backgroundColor: color.fillQuiet,
  },
  glyph: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: radiusAdmin.sm - 2,
    fontSize: 10,
    fontWeight: '700',
    overflow: 'hidden',
  },
  mediaBadge: {
    left: 4,
    bottom: 4,
    backgroundColor: color.scrimStrong,
    color: color.white,
  },
  takeBadge: {
    left: 4,
    top: 4,
    backgroundColor: color.amber,
    color: color.white,
  },
});
