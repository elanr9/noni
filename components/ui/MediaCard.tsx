import { useId, type ReactNode } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { color, shadow } from '../../theme/tokens';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';

export type MediaFormat = 'reel' | 'slideshow' | 'video' | 'photo_carousel';

export interface MediaCardProps {
  title: string;
  meta?: string;
  format: MediaFormat;
  time?: string;
  duration?: string;
  thumbnail?: string;
  variant: 'hero' | 'tile';
  mediaHeight?: number;
  fill?: boolean;
  onPlay?: () => void;
  onPress?: () => void;
  children?: ReactNode;
}

/** linear-gradient(160deg, #E7F4FD 0%, #DCE7F0 100%) placeholder frame. */
function PlaceholderGradient({ id }: { id: string }) {
  return (
    <Svg style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id={id} x1="0%" y1="0%" x2="34%" y2="94%">
          <Stop offset="0" stopColor="#E7F4FD" />
          <Stop offset="1" stopColor="#DCE7F0" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/** linear-gradient(180deg, rgba(0,0,0,0) 42%, rgba(0,0,0,0.66) 100%) hero scrim. */
function Scrim({ id }: { id: string }) {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0" stopColor="#000000" stopOpacity="0" />
          <Stop offset="0.42" stopColor="#000000" stopOpacity="0" />
          <Stop offset="1" stopColor="#000000" stopOpacity="0.66" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

export function MediaCard({
  title,
  meta,
  format,
  time,
  duration,
  thumbnail,
  variant,
  mediaHeight,
  fill = false,
  onPlay,
  onPress,
  children,
}: MediaCardProps) {
  const gradientId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const hero = variant === 'hero';
  const slideshow = format === 'slideshow' || format === 'photo_carousel';
  const frameHeight = mediaHeight ?? (hero ? 200 : 132);
  const playSize = hero ? 54 : 40;

  const outerStyle: StyleProp<ViewStyle> = [
    styles.outer,
    hero ? styles.outerHero : styles.outerTile,
    hero ? shadow.shadowRaised : shadow.shadowCard,
    fill && styles.outerFill,
  ];

  const body = (
    <View style={[styles.clip, hero ? styles.clipHero : styles.clipTile, fill && styles.clipFill]}>
      <View style={fill ? styles.frameFill : { height: frameHeight }}>
        {thumbnail !== undefined ? (
          <Image
            source={{ uri: thumbnail }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <PlaceholderGradient id={`ph${gradientId}`} />
        )}

        {hero && <Scrim id={`scrim${gradientId}`} />}

        <View style={styles.formatPill}>
          <Icon name={slideshow ? 'images' : 'video'} size={13} color={color.ink} />
          <Text style={styles.formatText}>{slideshow ? 'Slideshow' : 'Reel'}</Text>
        </View>

        {time !== undefined && (
          <View style={styles.timePill}>
            <Text style={styles.timeText} numberOfLines={1}>
              {time}
            </Text>
          </View>
        )}

        <View style={styles.playWrap} pointerEvents="box-none">
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={slideshow ? 'Open slideshow' : 'Play'}
            onPress={onPlay ?? onPress}
            style={[
              styles.play,
              shadow.shadowMedia,
              { width: playSize, height: playSize },
            ]}
          >
            <Icon
              name={slideshow ? 'images' : 'play'}
              size={hero ? 23 : 17}
              color={color.ink}
            />
          </PressableScale>
        </View>

        {duration !== undefined && (
          <View style={styles.durationPill}>
            <Text style={styles.durationText} numberOfLines={1}>
              {duration}
            </Text>
          </View>
        )}

        {hero && (
          <Text style={styles.heroTitle} numberOfLines={2}>
            {title}
          </Text>
        )}
      </View>

      {hero
        ? children !== undefined && <View style={styles.body}>{children}</View>
        : (
          <View style={styles.body}>
            <Text style={styles.tileTitle} numberOfLines={2}>
              {title}
            </Text>
            {meta !== undefined && (
              <Text style={styles.tileMeta} numberOfLines={1}>
                {meta}
              </Text>
            )}
          </View>
        )}
    </View>
  );

  if (onPress !== undefined) {
    return (
      <PressableScale accessibilityRole="button" onPress={onPress} style={outerStyle}>
        {body}
      </PressableScale>
    );
  }
  return <View style={outerStyle}>{body}</View>;
}

const styles = StyleSheet.create({
  outer: {
    backgroundColor: color.white,
    minWidth: 0,
    minHeight: 0,
  },
  outerHero: {
    borderRadius: 24,
  },
  outerTile: {
    borderRadius: 18,
  },
  outerFill: {
    height: '100%',
  },
  clip: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: color.line,
    flexDirection: 'column',
    minWidth: 0,
    minHeight: 0,
  },
  clipHero: {
    borderRadius: 24,
  },
  clipTile: {
    borderRadius: 18,
  },
  clipFill: {
    flex: 1,
  },
  frameFill: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minHeight: 0,
  },
  formatPill: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  formatText: {
    color: color.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  timePill: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,32,0.55)',
  },
  timeText: {
    color: color.white,
    fontSize: 12,
    fontWeight: '700',
  },
  playWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  play: {
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationPill: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,32,0.55)',
  },
  durationText: {
    color: color.white,
    fontSize: 11,
    fontWeight: '700',
  },
  heroTitle: {
    position: 'absolute',
    left: 16,
    right: 76,
    bottom: 14,
    color: color.white,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 27,
    letterSpacing: -0.3,
  },
  body: {
    flexGrow: 0,
    flexShrink: 0,
    padding: 12,
    gap: 3,
  },
  tileTitle: {
    color: color.textStrong,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20.25,
    letterSpacing: -0.2,
  },
  tileMeta: {
    color: color.textMuted,
    fontSize: 13,
    fontWeight: '400',
  },
});
