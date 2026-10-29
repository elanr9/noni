// Post detail (ANALYTICS.md 4, V2Briefs BriefScreen): back title "Post", a
// header block with the frame (tap for the preview modal), title and a
// tappable creator line; for live posts the Total / TikTok / Instagram
// toggle, the stats card keyed by platform and the Open on platform pill.
import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import type { PlatformStats } from '../../../../lib/analytics-api';
import { fmt, postDate } from '../../../../lib/v2-format';
import { creatorFor, platformStats, useV2Data, type V2Post } from '../../../../lib/v2-posts';
import { color, motion, shadow, tone, type Tone } from '../../../../theme/v2';
import { Avatar, Icon, InstagramFill, InstagramMark, Press, Screen, TikTokMark, tap, type IconName } from '../../../v2';
import { PostFrame } from './PostFrame';

type Platform = 'all' | 'tt' | 'ig';
const PLATFORMS: readonly { key: Platform; label: string }[] = [
  { key: 'all', label: 'Total' },
  { key: 'tt', label: 'TikTok' },
  { key: 'ig', label: 'Instagram' },
];
const MINI: readonly { key: keyof PlatformStats; label: string; icon: IconName; tone: Tone }[] = [
  { key: 'likes', label: 'likes', icon: 'favorite', tone: 'pink' },
  { key: 'comments', label: 'comments', icon: 'chat_bubble', tone: 'blue' },
  { key: 'shares', label: 'shares', icon: 'send', tone: 'purple' },
  { key: 'saves', label: 'saves', icon: 'bookmark', tone: 'amber' },
];

/** Links for a post: its own URL on the platform it was posted to, else the creator's profile. */
export function postLinks(p: V2Post, handle: string | null): { tiktok: string; instagram: string } {
  const h = (handle || '').replace(/^@/, '');
  const own = p.postUrl || '';
  return {
    tiktok: /tiktok\.com/.test(own) ? own : `https://www.tiktok.com/@${h}`,
    instagram: /instagram\.com/.test(own) ? own : `https://www.instagram.com/${h}`,
  };
}

function openUrl(url: string) {
  tap();
  void Linking.openURL(url).catch(() => undefined);
}

function Mark({ platform, color: c, size = 15 }: { platform: Platform; color: string; size?: number }) {
  if (platform === 'tt') return <TikTokMark size={size} color={c} />;
  if (platform === 'ig') return <InstagramMark size={size} color={c} />;
  return null;
}

/** Grey-1 track with an inset ring; the selected item is a white pill that slides in 200ms. */
function PlatformToggle({ value, onChange }: { value: Platform; onChange: (p: Platform) => void }) {
  const [w, setW] = useState(0);
  const idx = PLATFORMS.findIndex((p) => p.key === value);
  const x = useSharedValue(0);
  useEffect(() => {
    x.set(withTiming(idx * w, { duration: 200, easing: motion.tabEase }));
  }, [idx, w, x]);
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  return (
    <View style={styles.track} onLayout={(e: LayoutChangeEvent) => setW((e.nativeEvent.layout.width - 6) / 3)}>
      {w > 0 ? <Animated.View pointerEvents="none" style={[styles.pill, { width: w }, pill]} /> : null}
      {PLATFORMS.map((p) => {
        const on = p.key === value;
        const fg = on ? color.blueDeep : color.grey4;
        return (
          <Press key={p.key} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange(p.key)} haptic={!on} style={styles.item}>
            <Mark platform={p.key} color={fg} />
            <Text style={{ fontSize: 14, lineHeight: 36, fontWeight: on ? '700' : '600', color: fg }}>{p.label}</Text>
          </Press>
        );
      })}
    </View>
  );
}

function Big({ v, label, icon, t }: { v: string; label: string; icon: IconName; t: Tone }) {
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Icon name={icon} size={16} color={tone[t].fg} />
        <Text style={{ fontSize: 13, lineHeight: 16, fontWeight: '500', color: color.grey4 }}>{label}</Text>
      </View>
      <Text style={{ fontSize: 26, lineHeight: 30, fontWeight: '800', letterSpacing: -0.6, color: color.ink, fontVariant: ['tabular-nums'] }}>{v}</Text>
    </View>
  );
}

function Mini({ v, label, icon, t }: { v: string; label: string; icon: IconName; t: Tone }) {
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: tone[t].tint, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={19} color={tone[t].fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text style={{ fontSize: 16, lineHeight: 20, fontWeight: '700', letterSpacing: -0.2, color: color.ink }}>{v}</Text>
        <Text style={{ fontSize: 12, lineHeight: 14, fontWeight: '500', color: color.grey4 }}>{label}</Text>
      </View>
    </View>
  );
}

/** Black TikTok or Instagram gradient pill with the mark and a label. */
function PlatformPill({ platform, label, height, url }: { platform: 'tt' | 'ig'; label: string; height: number; url: string }) {
  return (
    <Press accessibilityRole="link" onPress={() => openUrl(url)} style={{ flex: 1, height, borderRadius: 999, overflow: 'hidden', backgroundColor: platform === 'tt' ? color.ink : 'transparent', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      {platform === 'ig' ? <InstagramFill style={StyleSheet.absoluteFill} /> : null}
      <Mark platform={platform} color={color.white} size={16} />
      <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: color.white }}>{label}</Text>
    </Press>
  );
}

function PreviewModal({ p, links, onClose }: { p: V2Post; links: { tiktok: string; instagram: string }; onClose: () => void }) {
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(180)} style={StyleSheet.absoluteFill}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close preview" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: color.ink, opacity: 0.6 }]} />
      </Animated.View>
      <View pointerEvents="box-none" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Animated.View entering={FadeInDown.duration(260).easing(motion.tabEase)} style={styles.modalCard}>
          <View style={styles.frame}>
            <PostFrame post={p} width="100%" height={0} radius={0} style={{ height: '100%' }} />
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 100 }}>
              <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 1 1">
                <Defs>
                  <LinearGradient id="v2-preview-fade" x1={0} y1={1} x2={0} y2={0}>
                    <Stop offset="0" stopColor="#000000" stopOpacity={0.65} />
                    <Stop offset="1" stopColor="#000000" stopOpacity={0} />
                  </LinearGradient>
                </Defs>
                <Rect width={1} height={1} fill="url(#v2-preview-fade)" />
              </Svg>
            </View>
            <Text style={{ position: 'absolute', left: 14, right: 14, bottom: 12, fontSize: 15, lineHeight: 20, fontWeight: '700', color: color.white }}>{p.title}</Text>
            <Press accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.closeDisc}>
              <Icon name="close" size={20} color={color.white} />
            </Press>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <PlatformPill platform="tt" label="TikTok" height={50} url={links.tiktok} />
            <PlatformPill platform="ig" label="Instagram" height={50} url={links.instagram} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export interface BriefPostScreenProps {
  id: string;
  /** Pushes the creator profile from the creator line. */
  onCreator?: (creatorId: string) => void;
}

export function BriefPostScreen({ id, onCreator }: BriefPostScreenProps) {
  const posts = useV2Data((s) => s.posts);
  const creators = useV2Data((s) => s.creators);
  const [plat, setPlat] = useState<Platform>('all');
  const [modal, setModal] = useState(false);
  const p = posts.find((x) => x.id === id);
  if (!p) return <Screen back title="Post" />;
  const c = creatorFor(creators, p);
  const posted = p.state === 'Posted';
  const links = postLinks(p, c.handle);
  const stats = platformStats(p, plat);
  const creatorLine = (
    <>
      <Avatar name={c.name} photo={c.photo} tone={c.tone} size={22} ring={false} />
      <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 14, lineHeight: 18, fontWeight: '600', color: color.ink }}>
        {c.name}
      </Text>
      <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, lineHeight: 18, fontWeight: '500', color: color.grey4 }}>
        {posted ? `· Posted ${postDate(p.date)}` : `· ${p.state === 'Waiting' ? 'In review' : p.state}`}
      </Text>
    </>
  );

  return (
    <Screen back title="Post" scroll>
      <View style={styles.head}>
        <Press accessibilityRole="button" accessibilityLabel="Preview" onPress={() => setModal(true)} style={{ borderRadius: 12 }}>
          <PostFrame post={p} width={72} height={99} radius={12} />
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
            <View style={styles.playDisc}>
              <Icon name="play_arrow" size={18} color={color.white} />
            </View>
          </View>
        </Press>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>{p.title}</Text>
          {onCreator && p.creatorId ? (
            <Press accessibilityRole="button" onPress={() => onCreator(p.creatorId as string)} style={styles.creator}>
              {creatorLine}
            </Press>
          ) : (
            <View style={styles.creator}>{creatorLine}</View>
          )}
        </View>
      </View>

      {posted ? (
        <>
          <PlatformToggle value={plat} onChange={setPlat} />
          <Animated.View key={plat} entering={FadeInDown.duration(220).easing(motion.tabEase)} style={styles.card}>
            <View style={styles.bigRow}>
              <Big v={fmt(stats.views)} label="views" icon="play_circle" t="blue" />
            </View>
            <View style={{ paddingTop: 14, gap: 14 }}>
              {[MINI.slice(0, 2), MINI.slice(2)].map((row, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
                  {row.map((m) => (
                    <Mini key={m.key} v={fmt(stats[m.key])} label={m.label} icon={m.icon} t={m.tone} />
                  ))}
                </View>
              ))}
            </View>
            {plat !== 'all' ? (
              <View style={{ flexDirection: 'row', marginTop: 14 }}>
                <PlatformPill platform={plat} label={plat === 'tt' ? 'Open on TikTok' : 'Open on Instagram'} height={46} url={plat === 'tt' ? links.tiktok : links.instagram} />
              </View>
            ) : null}
          </Animated.View>
        </>
      ) : null}

      {modal ? <PreviewModal p={p} links={links} onClose={() => setModal(false)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 2, paddingHorizontal: 2, paddingBottom: 16 },
  playDisc: { width: 28, height: 28, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, lineHeight: 23, fontWeight: '800', letterSpacing: -0.3, color: color.ink },
  creator: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8, alignSelf: 'flex-start', maxWidth: '100%' },
  track: { flexDirection: 'row', backgroundColor: color.grey1, borderRadius: 999, padding: 3, marginBottom: 12, boxShadow: `inset 0 0 0 1px ${color.grey2}` },
  pill: { position: 'absolute', top: 3, left: 3, height: 36, borderRadius: 999, backgroundColor: color.card, ...shadow.card },
  item: { flex: 1, height: 36, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  card: { backgroundColor: color.card, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 12, ...shadow.card },
  bigRow: { flexDirection: 'row', gap: 28, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: color.grey1 },
  modalCard: { width: '100%', backgroundColor: color.card, borderRadius: 24, padding: 14, ...shadow.float },
  frame: { aspectRatio: 9 / 13, borderRadius: 16, overflow: 'hidden', backgroundColor: color.ink },
  closeDisc: { position: 'absolute', top: 10, right: 10, width: 34, height: 34, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
});
