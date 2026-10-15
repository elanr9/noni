// Ghosted platform chrome over the slide (SSCanvas.jsx PlatformGhost):
// TikTok slideshow bands, TikTok reel rail and caption, Instagram 4:5 bands.
// Everything sits in fractions of the frame so it scales with the canvas.
//
// The ghost is a guide, not content: thin outlines and plain bars, no fake
// handle, counts or copy. The caption group sits in its own layer so the
// editor can hide it under the note card and bring it back while dragging.

import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';

import { color } from '../../../../theme/tokens';
import { Icon, type IconName } from '../../../ui/Icon';
import { IG_BAR, TT_SS, type Platform } from './layout';

const RAIL: IconName[] = ['heart', 'message-circle', 'bookmark', 'share-2'];
const TABS: IconName[] = ['house', 'users', 'plus', 'inbox', 'circle-user-round'];
const STROKE = 1.5;

export function PlatformGhost({
  platform,
  w,
  h,
  reel,
  light = false,
  captionStyle,
}: {
  platform: Platform;
  w: number;
  h: number;
  reel: boolean;
  light?: boolean;
  /** Style for the caption group (handle, caption lines, sound, tab bar), e.g. an animated opacity. */
  captionStyle?: StyleProp<AnimatedStyle<StyleProp<ViewStyle>>>;
}) {
  const ink = light ? color.inkA55 : color.whiteA60;
  const band = light ? color.scrim : color.ink900;
  const dim = light ? color.scrim : color.whiteA28;
  const bar = Math.max(4, Math.round(w * 0.022));
  const line = (width: `${number}%`, strong = false) => (
    <View style={{ height: bar, width, borderRadius: 99, backgroundColor: strong ? ink : dim }} />
  );
  const iconSize = (f: number) => Math.round(w * f);

  if (platform === 'instagram') {
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.band, { top: 0, height: IG_BAR * h, backgroundColor: band }]} />
        <View style={[styles.band, { bottom: 0, height: IG_BAR * h, backgroundColor: band }]} />
        <Animated.View
          style={[styles.band, { bottom: 0, height: IG_BAR * h, paddingVertical: w * 0.035, paddingHorizontal: w * 0.04, gap: w * 0.025 }, captionStyle]}
        >
          <View style={styles.row}>
            <View style={[styles.row, styles.grow, { gap: w * 0.035 }]}>
              {(['heart', 'message-circle', 'send'] as IconName[]).map((n) => (
                <Icon key={n} name={n} size={iconSize(0.058)} color={ink} strokeWidth={STROKE} />
              ))}
            </View>
            <Icon name="bookmark" size={iconSize(0.058)} color={ink} strokeWidth={STROKE} />
          </View>
          {line('42%')}
          {line('70%')}
        </Animated.View>
        <View style={[styles.counter, { right: w * 0.04, top: IG_BAR * h + w * 0.03, width: w * 0.1, height: w * 0.055, borderColor: dim }]} />
      </View>
    );
  }

  const rail = RAIL.map((n) => <Icon key={n} name={n} size={iconSize(0.07)} color={ink} strokeWidth={STROKE} />);
  const avatar = <View style={{ width: w * 0.095, height: w * 0.095, borderRadius: 99, borderWidth: STROKE, borderColor: ink }} />;

  if (!reel) {
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.band, { top: 0, height: TT_SS.top * h, backgroundColor: band }]} />
        <View style={{ position: 'absolute', right: w * 0.045, bottom: (TT_SS.bottom + 0.03) * h, alignItems: 'center', gap: w * 0.055 }}>
          {avatar}
          {rail}
        </View>
        <View style={[styles.band, { bottom: 0, height: TT_SS.bottom * h, backgroundColor: band }]} />
        <Animated.View style={[styles.band, { bottom: 0, height: TT_SS.bottom * h, paddingTop: w * 0.035, paddingHorizontal: w * 0.04, gap: w * 0.025 }, captionStyle]}>
          {line('30%', true)}
          {line('78%')}
          {line('52%')}
          <View style={[styles.row, styles.tabs, { height: w * 0.12, borderTopColor: dim, marginHorizontal: -w * 0.04 }]}>
            {TABS.map((n) => (
              <Icon key={n} name={n} size={iconSize(0.055)} color={dim} strokeWidth={STROKE} />
            ))}
          </View>
        </Animated.View>
      </View>
    );
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', right: w * 0.045, top: 0.44 * h, height: 0.42 * h, alignItems: 'center', justifyContent: 'space-between' }}>
        {avatar}
        {rail}
        <View style={{ width: w * 0.085, height: w * 0.085, borderRadius: 99, borderWidth: STROKE, borderColor: dim }} />
      </View>
      <Animated.View style={[{ position: 'absolute', left: w * 0.04, width: 0.72 * w, bottom: 0.04 * h, gap: w * 0.028 }, captionStyle]}>
        {line('34%', true)}
        {line('92%')}
        {line('64%')}
        <View style={[styles.row, { gap: w * 0.015 }]}>
          <Icon name="music-2" size={iconSize(0.035)} color={dim} strokeWidth={STROKE} />
          {line('30%')}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: { position: 'absolute', left: 0, right: 0 },
  row: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1 },
  tabs: { marginTop: 'auto', borderTopWidth: 1, justifyContent: 'space-around' },
  counter: { position: 'absolute', borderRadius: 99, borderWidth: 1.5 },
});
