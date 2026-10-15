// TikTok For you page chrome with real copy (SSFlow.jsx FypChrome).
// Slideshows are letterboxed with the tabs band, dots, caption and tab bar;
// reels get the rail, caption and "original sound" over the clip.

import { GradientFill as LinearGradient } from '../../../shared/briefs/GradientFill';
import { StyleSheet, Text, View } from 'react-native';

import { briefTone, color, type as typeToken } from '../../../../theme/tokens';
import { Icon, type IconName } from '../../../ui/Icon';
import { TT_SS } from '../canvas/layout';

const TABS: IconName[] = ['house', 'users', 'plus', 'inbox', 'circle-user-round'];

function R({ icon, n }: { icon: IconName; n: string }) {
  return (
    <View style={styles.railItem}>
      <Icon name={icon} size={28} color={color.white} />
      <Text style={styles.railText}>{n}</Text>
    </View>
  );
}

function Rail({ gap }: { gap: number }) {
  return (
    <View style={{ alignItems: 'center', gap }}>
      <View style={styles.avatar}>
        <LinearGradient colors={[color.slate500, briefTone.canvas.chrome]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      </View>
      <R icon="heart" n="12.4K" />
      <R icon="message-circle" n="312" />
      <R icon="bookmark" n="2,108" />
      <R icon="share-2" n="864" />
    </View>
  );
}

export function FypChrome({
  caption,
  tags,
  handle = '@elan.recruiting',
  w,
  h,
  index,
  count,
  reel,
}: {
  caption: string;
  tags: string[];
  handle?: string;
  w: number;
  h: number;
  index: number;
  count: number;
  reel: boolean;
}) {
  const tagLine = tags.map((t) => `#${t}`).join(' ');
  if (!reel) {
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.band, { top: 0, height: TT_SS.top * h, justifyContent: 'flex-end', alignItems: 'center', flexDirection: 'row', gap: 22, paddingBottom: 10 }]}>
          <Text style={[styles.tab, { color: color.whiteA60 }]}>Following</Text>
          <Text style={[styles.tab, styles.tabOn]}>For you</Text>
        </View>
        <View style={{ position: 'absolute', right: 10, bottom: (TT_SS.bottom + 0.02) * h }}>
          <Rail gap={14} />
        </View>
        <View style={[styles.band, { bottom: 0, height: TT_SS.bottom * h, paddingTop: 10, paddingHorizontal: 14, gap: 6 }]}>
          <View style={styles.dots}>
            {Array.from({ length: count }).map((_, k) => (
              <View key={k} style={[styles.dot, { backgroundColor: k === index ? color.white : color.whiteA45 }]} />
            ))}
          </View>
          <Text style={styles.handle}>{handle}</Text>
          <Text numberOfLines={2} style={styles.caption}>
            {caption || 'Caption'} <Text style={styles.tags}>{tagLine}</Text>
          </Text>
          <View style={styles.tabBar}>
            {TABS.map((n, i) => (
              <Icon key={n} name={n} size={i === 2 ? 28 : 24} color={i === 0 ? color.white : color.whiteA60} />
            ))}
          </View>
        </View>
      </View>
    );
  }
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient colors={['transparent', color.scrimStrong]} style={[styles.band, { bottom: 0, height: 0.38 * h }]} />
      <View style={{ position: 'absolute', right: 10, bottom: 0.14 * h }}>
        <Rail gap={16} />
      </View>
      <View style={{ position: 'absolute', left: 14, right: 78, bottom: 18, gap: 6 }}>
        <Text style={styles.handle}>{handle}</Text>
        <Text numberOfLines={3} style={styles.captionReel}>
          {caption || 'Caption'} <Text style={styles.tags}>{tagLine}</Text>
        </Text>
        <View style={styles.sound}>
          <Icon name="music-2" size={13} color={color.white} />
          <Text style={styles.soundText}>original sound</Text>
        </View>
      </View>
      <View style={{ width: w, height: 0 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  band: { position: 'absolute', left: 0, right: 0, backgroundColor: color.ink900 },
  tab: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 15 },
  tabOn: { color: color.white, borderBottomWidth: 2, borderBottomColor: color.white, paddingBottom: 4 },
  railItem: { alignItems: 'center', gap: 2 },
  railText: { fontFamily: typeToken.font.ui, fontWeight: typeToken.weight.semibold, fontSize: typeToken.size.micro11, color: color.whiteA90 },
  avatar: { width: 42, height: 42, borderRadius: 999, overflow: 'hidden', borderWidth: 2, borderColor: color.white },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 4, marginBottom: 2 },
  dot: { width: 5, height: 5, borderRadius: 99 },
  handle: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 15, color: color.white },
  caption: { fontFamily: typeToken.font.ui, fontWeight: '500', fontSize: 13.5, lineHeight: 13.5 * 1.35, color: color.white },
  captionReel: { fontFamily: typeToken.font.ui, fontWeight: '500', fontSize: 14, lineHeight: 14 * 1.35, color: color.white },
  tags: { fontWeight: '700' },
  tabBar: { marginTop: 'auto', height: 50, borderTopWidth: 1, borderTopColor: color.whiteA16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginHorizontal: -14 },
  sound: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  soundText: { fontFamily: typeToken.font.ui, fontWeight: '500', fontSize: 13, color: color.white },
});
