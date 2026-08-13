import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { color, radiusAdmin, shadow } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';

export interface PostThumbProps {
  /** Real thumbnail — Reel first frame or slide 1. Gradient fallback when missing. */
  uri?: string | null;
  /** Bottom-left media badge: duration for Reels, slide count for Slideshows. */
  badge?: string;
  /** Top-left amber badge when attempt > 1, e.g. "Take 2". */
  takeBadge?: string;
  format: 'video' | 'photo_carousel';
  /** Default queue thumb box is 54×72. */
  width?: number;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Admin handoff §1 media rule — fixed box, cover fit, badges live on the
 * media, 160deg light-blue gradient with a blue-300 glyph as the
 * missing-asset fallback.
 */
export function PostThumb({
  uri,
  badge,
  takeBadge,
  format,
  width = 54,
  height = 72,
  radius = radiusAdmin.sm,
  style,
}: PostThumbProps) {
  const discSize = Math.min(34, Math.max(18, Math.round(width * 0.4)));
  return (
    <View
      style={[{ width, height, borderRadius: radius }, shadow.shadowMedia, style]}
    >
      <View style={[styles.clip, { borderRadius: radius }]}>
        {uri ? (
          <Image source={{ uri }} resizeMode="cover" style={StyleSheet.absoluteFill} />
        ) : (
          <>
            {/* linear-gradient(160deg, blue100 0%, mediaGradEnd 100%) */}
            <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
              <Defs>
                <LinearGradient id="noniPostThumb" x1="33%" y1="3%" x2="67%" y2="97%">
                  <Stop offset="0" stopColor={color.blue100} />
                  <Stop offset="1" stopColor={color.mediaGradEnd} />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#noniPostThumb)" />
            </Svg>
            <View style={styles.glyph}>
              {format === 'video' ? (
                // Design language: small white play disc on video placeholders.
                <View
                  style={[
                    styles.playDisc,
                    shadow.shadowCard,
                    { width: discSize, height: discSize, borderRadius: discSize / 2 },
                  ]}
                >
                  <Icon name="play" size={Math.round(discSize * 0.42)} color={color.ink} />
                </View>
              ) : (
                <Icon name="images" size={Math.min(18, width * 0.32)} color={color.blue300} />
              )}
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
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: color.fillQuiet,
  },
  glyph: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playDisc: {
    backgroundColor: color.whiteA90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: radiusAdmin.pill,
    fontWeight: '700',
    color: color.white,
    overflow: 'hidden',
  },
  mediaBadge: {
    left: 4,
    bottom: 4,
    fontSize: 10,
    backgroundColor: color.inkA55,
  },
  takeBadge: {
    left: 4,
    top: 4,
    fontSize: 9,
    backgroundColor: color.amber,
  },
});
