import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import Animated, { cancelAnimation, Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { VideoView, type VideoPlayer } from 'expo-video';

import { color, motion, radius, shadow } from '../../../../../theme/v2';
import { Avatar, Icon, tap, type IconName } from '../../../../v2';

/** Feed chrome colours: the platform's follow red and the overlay scrims. */
const FEED = {
  follow: 'rgb(254,44,85)',
  dim: 'rgba(255,255,255,0.72)',
  pill: 'rgba(0,0,0,0.45)',
  playDisc: 'rgba(255,255,255,0.9)',
  shade: 'rgba(0,0,0,0.45)',
  vinylA: 'rgb(51,51,51)',
  vinylB: 'rgb(17,17,17)',
  black: 'rgb(0,0,0)',
} as const;

const RAIL: IconName[] = ['favorite', 'mode_comment', 'bookmark', 'reply'];

function Shade({ height, from, top }: { height: number; from: number; top?: boolean }) {
  return (
    <Svg pointerEvents="none" width="100%" height={height} style={[styles.shade, top ? { top: 0 } : { bottom: 0 }]}>
      <Defs>
        <LinearGradient id={top ? 'shTop' : 'shBot'} x1="0" y1={top ? '0' : '1'} x2="0" y2={top ? '1' : '0'}>
          <Stop offset="0" stopColor={FEED.black} stopOpacity={from} />
          <Stop offset="1" stopColor={FEED.black} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height={height} fill={`url(#${top ? 'shTop' : 'shBot'})`} />
    </Svg>
  );
}

function Vinyl({ spinning, name, photo }: { spinning: boolean; name: string; photo: string | null }) {
  const turn = useSharedValue(0);
  useEffect(() => {
    if (spinning) {
      turn.set(withRepeat(withTiming(turn.get() + 360, { duration: 4000, easing: Easing.linear }), -1, false));
    } else {
      cancelAnimation(turn);
    }
  }, [spinning, turn]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get()}deg` }] }));
  return (
    <Animated.View style={[styles.vinyl, spin]}>
      <View style={styles.vinylHalf} />
      <View style={styles.vinylAvatar}>
        <Avatar name={name} photo={photo} size={22} ring={false} />
      </View>
    </Animated.View>
  );
}

export interface FeedBandProps {
  /** Null for a slideshow: `children` draws the slides instead. */
  player: VideoPlayer | null;
  hasVideo: boolean;
  playing: boolean;
  fast: boolean;
  scrubbing: boolean;
  onToggle: () => void;
  onFast: (on: boolean) => void;
  creatorName: string;
  creatorPhoto: string | null;
  handle: string | null;
  caption: string;
  /** Slideshow surface, or a placeholder while the video signs. */
  children?: ReactNode;
}

/**
 * The video band: the post as it lands in the feed. Tap toggles play, a 300ms
 * hold on the right half plays at 2x until release. Rail and caption fade
 * while the scrubber is held.
 */
export function FeedBand({ player, hasVideo, playing, fast, scrubbing, onToggle, onFast, creatorName, creatorPhoto, handle, caption, children }: FeedBandProps) {
  const [width, setWidth] = useState(0);
  const [holding, setHolding] = useState(false);
  const chrome = useSharedValue(1);
  useEffect(() => {
    chrome.set(withTiming(scrubbing ? 0 : 1, { duration: 150, easing: motion.ease }));
  }, [scrubbing, chrome]);
  const chromeStyle = useAnimatedStyle(() => ({ opacity: chrome.get() }));

  const short = caption.length > 70 ? `${caption.slice(0, 68).replace(/\s+\S*$/, '')}... ` : caption ? `${caption} ` : '';
  const shownHandle = handle ? (handle.startsWith('@') ? handle : `@${handle}`) : creatorName;

  const onLongPress = (e: GestureResponderEvent) => {
    if (!hasVideo || e.nativeEvent.locationX < width / 2) return;
    setHolding(true);
    tap();
    onFast(true);
  };
  const onPressOut = () => {
    if (!holding) return;
    setHolding(false);
    onFast(false);
  };

  return (
    <View style={styles.band} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {player && hasVideo ? <VideoView style={StyleSheet.absoluteFill} player={player} contentFit="cover" nativeControls={false} /> : null}
      {children}
      {hasVideo ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause' : 'Play'}
          accessibilityHint="Hold the right side to play at double speed"
          onPress={() => {
            tap();
            onToggle();
          }}
          onLongPress={onLongPress}
          delayLongPress={300}
          onPressOut={onPressOut}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      <Shade height={70} from={0.4} top />
      <View pointerEvents="none" style={styles.tabs}>
        <View>
          <Text style={styles.following}>Following</Text>
          <View style={styles.followDot} />
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.forYou}>For You</Text>
          <View style={styles.underline} />
        </View>
      </View>
      <View pointerEvents="none" style={styles.search}>
        <Icon name="search" size={28} color={color.white} />
      </View>
      <Shade height={240} from={0.55} />

      {fast ? (
        <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(120)} pointerEvents="none" style={styles.fastRow}>
          <View style={styles.fastPill}>
            <Icon name="fast_forward" size={16} color={color.white} />
            <Text style={styles.fastText}>2x</Text>
          </View>
        </Animated.View>
      ) : null}
      {hasVideo && !playing ? (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} pointerEvents="none" style={styles.centre}>
          <View style={styles.playDisc}>
            <Icon name="play_arrow" size={40} color={color.ink} />
          </View>
        </Animated.View>
      ) : null}

      <Animated.View pointerEvents="none" style={[styles.rail, chromeStyle]}>
        <View style={styles.railAvatar}>
          <View style={styles.railRing}>
            <Avatar name={creatorName} photo={creatorPhoto} size={44} ring={false} />
          </View>
          <View style={styles.follow}>
            <Icon name="add" size={14} weight={700} color={color.white} />
          </View>
        </View>
        {RAIL.map((n) => (
          <View key={n} style={styles.railItem}>
            <Icon name={n} size={34} color={color.white} style={n === 'reply' ? { transform: [{ scaleX: -1 }] } : undefined} />
            <Text style={styles.railCount}>0</Text>
          </View>
        ))}
        <Vinyl spinning={playing} name={creatorName} photo={creatorPhoto} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.caption, chromeStyle]}>
        <Text style={styles.handle} numberOfLines={1}>
          {shownHandle}
        </Text>
        {short ? (
          <Text style={styles.captionText} numberOfLines={2}>
            {short}
            {caption.length > 70 ? <Text style={{ fontWeight: '600' }}>more</Text> : null}
          </Text>
        ) : null}
      </Animated.View>
    </View>
  );
}

const textShadow = { textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } };

const styles = StyleSheet.create({
  band: { flex: 1, backgroundColor: FEED.black, overflow: 'hidden' },
  shade: { position: 'absolute', left: 0, right: 0 },
  centre: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  tabs: { position: 'absolute', top: 12, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 24 },
  following: { fontSize: 17, lineHeight: 22, fontWeight: '500', color: FEED.dim, ...textShadow },
  followDot: { position: 'absolute', right: -9, top: 0, width: 7, height: 7, borderRadius: radius.pill, backgroundColor: FEED.follow },
  forYou: { fontSize: 17, lineHeight: 22, fontWeight: '700', color: color.white, ...textShadow },
  underline: { width: 22, height: 3, borderRadius: 2, backgroundColor: color.white, marginTop: 5 },
  search: { position: 'absolute', right: 16, top: 10 },
  fastRow: { position: 'absolute', top: 56, left: 0, right: 0, alignItems: 'center' },
  fastPill: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 26, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: FEED.pill },
  fastText: { fontSize: 13, fontWeight: '700', color: color.white },
  playDisc: { width: 72, height: 72, borderRadius: radius.pill, backgroundColor: FEED.playDisc, alignItems: 'center', justifyContent: 'center', ...shadow.float },
  rail: { position: 'absolute', right: 12, bottom: 52, width: 48, alignItems: 'center' },
  railAvatar: { width: 48, height: 48, marginBottom: 26 },
  railRing: { width: 48, height: 48, borderRadius: radius.pill, borderWidth: 2, borderColor: color.white, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  follow: { position: 'absolute', left: 14, bottom: -10, width: 20, height: 20, borderRadius: radius.pill, backgroundColor: FEED.follow, alignItems: 'center', justifyContent: 'center' },
  railItem: { alignItems: 'center', gap: 2, marginBottom: 18 },
  railCount: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: color.white },
  vinyl: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: FEED.vinylB, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  vinylHalf: { position: 'absolute', top: 0, left: 0, width: 20, height: 20, backgroundColor: FEED.vinylA, boxShadow: `20px 20px 0 ${FEED.vinylA}` },
  vinylAvatar: { width: 22, height: 22, borderRadius: radius.pill, overflow: 'hidden' },
  caption: { position: 'absolute', left: 12, right: 76, bottom: 52 },
  handle: { fontSize: 17, lineHeight: 22, fontWeight: '700', color: color.white, ...textShadow },
  captionText: { fontSize: 15, lineHeight: 20, color: color.white, marginTop: 6, ...textShadow },
});
