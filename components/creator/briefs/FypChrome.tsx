// TikTok For You chrome over the review frame, from SSFlow.jsx FypChrome.
// Slideshows are letterboxed: top tabs band, the slide, a bottom band with
// dots, handle, caption and the tab bar. Reels get the gradient and the
// floating caption. The avatar is the creator's real profile photo.
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, type JSX } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { supabase } from '../../../lib/supabase';
import { briefTone, color, type as typeToken } from '../../../theme/tokens';
import { Icon, type IconName } from '../../ui/Icon';

/** Letterbox bands TikTok shows around a slideshow (SSCanvas TT_SS). */
export const TT_SS = { top: 0.09, bottom: 0.22 };

export function useAvatarUrl(path: string | null | undefined): string | null {
  const [signed, setSigned] = useState<{ path: string; url: string } | null>(null);
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    void supabase.storage
      .from('avatars')
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (!cancelled && data) setSigned({ path, url: data.signedUrl });
      });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return path && signed?.path === path ? signed.url : null;
}

function RailItem({ icon, n }: { icon: IconName; n: string }): JSX.Element {
  return (
    <View style={styles.railItem}>
      <Icon name={icon} size={30} color={color.white} />
      <Text style={styles.railText}>{n}</Text>
    </View>
  );
}

export function FypChrome({
  caption,
  tags,
  handle,
  avatarUri,
  format,
  index = 0,
  count = 1,
}: {
  caption: string;
  tags: string;
  handle: string;
  avatarUri: string | null;
  format: 'slideshow' | 'reel';
  index?: number;
  count?: number;
}): JSX.Element {
  const avatar = (
    <View style={styles.avatar}>
      {avatarUri ? (
        <Image source={{ uri: avatarUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <LinearGradient colors={briefTone.reviewSlide} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      )}
    </View>
  );
  const rail = (
    <>
      <RailItem icon="heart" n="12.4K" />
      <RailItem icon="message-circle" n="312" />
      <RailItem icon="bookmark" n="2,108" />
      <RailItem icon="share-2" n="864" />
    </>
  );
  if (format === 'slideshow') {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={[styles.topBand, { height: `${TT_SS.top * 100}%` }]}>
          <Text style={styles.tabDim}>Following</Text>
          <Text style={styles.tabOn}>For you</Text>
        </View>
        <View style={[styles.rail, { bottom: `${(TT_SS.bottom + 0.02) * 100}%` }]}>
          {avatar}
          {rail}
        </View>
        <View style={[styles.bottomBand, { height: `${TT_SS.bottom * 100}%` }]}>
          <View style={styles.dots}>
            {Array.from({ length: count }, (_, k) => (
              <View key={k} style={[styles.dot, { backgroundColor: k === index ? color.white : color.whiteA45 }]} />
            ))}
          </View>
          <Text style={styles.handle}>{handle}</Text>
          <Text numberOfLines={2} style={styles.caption}>
            {caption || 'Caption'} <Text style={styles.tags}>{tags}</Text>
          </Text>
          <View style={styles.tabBar}>
            {(['house', 'users', 'plus', 'inbox', 'circle-user-round'] as IconName[]).map((n, i) => (
              <Icon key={n} name={n} size={i === 2 ? 28 : 24} color={i === 0 ? color.white : color.whiteA60} />
            ))}
          </View>
        </View>
      </View>
    );
  }
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.reelShade} />
      <View style={[styles.rail, { bottom: '14%' }]}>
        {avatar}
        {rail}
      </View>
      <View style={styles.reelCaption}>
        <Text style={styles.handle}>{handle}</Text>
        <Text style={styles.captionReel}>
          {caption || 'Caption'} <Text style={styles.tags}>{tags}</Text>
        </Text>
        <View style={styles.sound}>
          <Icon name="music-2" size={13} color={color.white} />
          <Text style={styles.soundText}>original sound</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBand: { position: 'absolute', left: 0, right: 0, top: 0, backgroundColor: color.ink900, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 22, paddingBottom: 10 },
  tabDim: { color: color.whiteA60, fontFamily: typeToken.font.ui, fontSize: 15, fontWeight: '700' },
  tabOn: { color: color.white, fontFamily: typeToken.font.ui, fontSize: 15, fontWeight: '700', borderBottomWidth: 2, borderBottomColor: color.white, paddingBottom: 4 },
  rail: { position: 'absolute', right: 10, alignItems: 'center', gap: 14 },
  avatar: { width: 44, height: 44, borderRadius: 999, borderWidth: 2, borderColor: color.white, overflow: 'hidden' },
  railItem: { alignItems: 'center', gap: 3 },
  railText: { color: color.white, fontFamily: typeToken.font.ui, fontSize: 12, fontWeight: '700' },
  bottomBand: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: color.ink900, paddingTop: 10, paddingHorizontal: 14, gap: 6 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 4, marginBottom: 2 },
  dot: { width: 5, height: 5, borderRadius: 99 },
  handle: { color: color.white, fontFamily: typeToken.font.ui, fontSize: 15, fontWeight: '700' },
  caption: { color: color.white, fontFamily: typeToken.font.ui, fontSize: 13.5, lineHeight: 18, fontWeight: '500' },
  tags: { fontWeight: '700' },
  tabBar: { marginTop: 'auto', height: 50, borderTopWidth: 1, borderTopColor: color.whiteA16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginHorizontal: -14 },
  reelShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '38%', backgroundColor: color.ink900, opacity: 0.45 },
  reelCaption: { position: 'absolute', left: 14, right: 78, bottom: 18, gap: 6 },
  captionReel: { color: color.white, fontFamily: typeToken.font.ui, fontSize: 14, lineHeight: 19, fontWeight: '500' },
  sound: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  soundText: { color: color.white, fontFamily: typeToken.font.ui, fontSize: 13, fontWeight: '500' },
});
