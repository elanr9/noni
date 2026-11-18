// Post detail (ANALYTICS.md 4, V2Briefs BriefScreen): back title "Post", a
// header block with the frame (tap for the preview modal), title and a
// tappable creator line; for live posts the Total / TikTok / Instagram
// toggle, the stats card keyed by platform and the Open on platform pill.
import { useEffect, useState, type ReactNode } from 'react';
import { Linking, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import type { PlatformStats } from '../../../../lib/analytics-api';
import { fmt, postDate, credit, signupsLabel, sales } from '../../../../lib/v2-format';
import { creatorFor, platformStats, useV2Data, type V2Post } from '../../../../lib/v2-posts';
import { color, editor, motion, shadow, tone, type Tone } from '../../../../theme/v2';
import { Avatar, Icon, InstagramFill, InstagramMark, Press, Screen, Skeleton, TikTokMark, type IconName } from '../../../v2';
import { usePresence } from '../newbrief/usePresence';
import { LoadError, StateCard } from './LoadError';
import { useV2Failed } from './useV2Refresh';
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

export type PostLinks = { tiktok: string | null; instagram: string | null };

/** Links for a post: its own URL on the platform it was posted to, else the creator's profile, else none. */
export function postLinks(p: V2Post, handle: string | null): PostLinks {
  const h = (handle || '').replace(/^@/, '').trim();
  const own = p.postUrl || '';
  return {
    tiktok: /tiktok\.com/.test(own) ? own : h ? `https://www.tiktok.com/@${h}` : null,
    instagram: /instagram\.com/.test(own) ? own : h ? `https://www.instagram.com/${h}` : null,
  };
}

function openUrl(url: string) {
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

/** Black TikTok or Instagram gradient pill with the mark and a label. Dimmed and inert with no link. */
function PlatformPill({ platform, label, height, url }: { platform: 'tt' | 'ig'; label: string; height: number; url: string | null }) {
  return (
    <Press
      accessibilityRole="link"
      accessibilityState={{ disabled: !url }}
      disabled={!url}
      onPress={() => url && openUrl(url)}
      style={{ flex: 1, height, borderRadius: 999, overflow: 'hidden', opacity: url ? 1 : 0.4, backgroundColor: platform === 'tt' ? color.ink : 'transparent', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
    >
      {platform === 'ig' ? <InstagramFill style={StyleSheet.absoluteFill} /> : null}
      <Mark platform={platform} color={color.white} size={16} />
      <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: color.white }}>{label}</Text>
    </Press>
  );
}

/** Why an Open on platform button is dimmed. */
function noLinkCopy(links: PostLinks, which: 'tt' | 'ig' | 'both'): string | null {
  const tt = !links.tiktok, ig = !links.instagram;
  if (which === 'tt') return tt ? "We don't have this post's TikTok link yet. It shows here once the creator's account is connected." : null;
  if (which === 'ig') return ig ? "We don't have this post's Instagram link yet. It shows here once the creator's account is connected." : null;
  if (tt && ig) return "We don't have links to this post yet. They show here once the creator's accounts are connected.";
  if (tt) return "We don't have this post's TikTok link yet.";
  if (ig) return "We don't have this post's Instagram link yet.";
  return null;
}

function NoLink({ copy }: { copy: string | null }) {
  if (!copy) return null;
  return <Text style={{ marginTop: 8, fontSize: 13, lineHeight: 18, fontWeight: '500', color: color.grey4, textAlign: 'center' }}>{copy}</Text>;
}

function PreviewModal({ open, p, links, onClose }: { open: boolean; p: V2Post; links: PostLinks; onClose: () => void }) {
  const { mounted, progress } = usePresence(open, 260, 200);
  const scrim = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const card = useAnimatedStyle(() => ({ opacity: progress.get(), transform: [{ translateY: 16 * (1 - progress.get()) }, { scale: 0.96 + 0.04 * progress.get() }] }));
  if (!mounted) return null;
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, scrim]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close preview" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: color.ink, opacity: 0.6 }]} />
      </Animated.View>
      <View pointerEvents={open ? 'box-none' : 'none'} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Animated.View style={[styles.modalCard, card]}>
          <View style={styles.frame}>
            <PostFrame post={p} width="100%" height={0} radius={0} style={{ height: '100%' }} />
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 100 }}>
              <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 1 1">
                <Defs>
                  <LinearGradient id="v2-preview-fade" x1={0} y1={1} x2={0} y2={0}>
                    <Stop offset="0" stopColor={editor.black} stopOpacity={0.65} />
                    <Stop offset="1" stopColor={editor.black} stopOpacity={0} />
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
          <NoLink copy={noLinkCopy(links, 'both')} />
        </Animated.View>
      </View>
    </Modal>
  );
}

export interface BriefPostScreenProps {
  id: string;
  /** Pushes the creator profile from the creator line. */
  onCreator?: (creatorId: string) => void;
  /** Pull to refresh. */
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Try again after a failed load. */
  onRetry?: () => void;
}

export function BriefPostScreen({ id, onCreator, refreshing = false, onRefresh, onRetry }: BriefPostScreenProps) {
  const insets = useSafeAreaInsets();
  const posts = useV2Data((s) => s.posts);
  const creators = useV2Data((s) => s.creators);
  const loaded = useV2Data((s) => s.loaded);
  const loading = useV2Data((s) => s.loading);
  const failed = useV2Failed();
  const stripeConnected = useV2Data((s) => s.stripeConnected);
  const [plat, setPlat] = useState<Platform>('all');
  const [modal, setModal] = useState(false);
  const p = posts.find((x) => x.id === id);
  const body = (children: ReactNode) => (
    <Screen back title="Post">
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 24) + 16 }}
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.grey4} colors={[color.blue]} /> : undefined}
      >
        {children}
      </ScrollView>
    </Screen>
  );
  if (!p) {
    if (failed) return body(<LoadError onRetry={onRetry ?? (() => undefined)} what="this post" />);
    if (!loaded || loading) {
      return body(
        <View style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            <Skeleton w={72} h={99} r={12} />
            <View style={{ flex: 1, gap: 10 }}>
              <Skeleton h={22} />
              <Skeleton h={18} w="60%" />
            </View>
          </View>
          <Skeleton h={42} />
          <Skeleton h={190} />
        </View>,
      );
    }
    return body(<StateCard icon="search" title="This post isn't here" body="It may have been removed, or it belongs to a different company. Pull down to check again." />);
  }
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

  return body(
    <>
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
            {plat !== 'all' ? <NoLink copy={noLinkCopy(links, plat)} /> : null}
          </Animated.View>
          {stripeConnected ? (
            <View style={[styles.card, { marginTop: 12 }]}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Mini v={sales(p.salesCents)} label="sales" icon="payments" t="green" />
                <Mini v={credit(p.signups)} label="sign-ups" icon="person_add" t="green" />
              </View>
              <Text style={{ marginTop: 12, fontSize: 12, lineHeight: 17, fontWeight: '500', color: color.grey4 }}>
                {c.code
                  ? `From customers who used ${c.name.split(' ')[0]}'s code ${c.code}, shared across their posts by the views each was getting that week.`
                  : `Give ${c.name.split(' ')[0]} a promo code on their profile to see the sales this post brings in.`}
              </Text>
            </View>
          ) : null}
        </>
      ) : null}

      <PreviewModal open={modal} p={p} links={links} onClose={() => setModal(false)} />
    </>,
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 2, paddingHorizontal: 2, paddingBottom: 16 },
  playDisc: { width: 28, height: 28, borderRadius: 999, backgroundColor: editor.k45, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, lineHeight: 23, fontWeight: '800', letterSpacing: -0.3, color: color.ink },
  creator: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8, alignSelf: 'flex-start', maxWidth: '100%' },
  track: { flexDirection: 'row', backgroundColor: color.grey1, borderRadius: 999, padding: 3, marginBottom: 12, boxShadow: `inset 0 0 0 1px ${color.grey2}` },
  pill: { position: 'absolute', top: 3, left: 3, height: 36, borderRadius: 999, backgroundColor: color.card, ...shadow.card },
  item: { flex: 1, height: 36, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  card: { backgroundColor: color.card, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 12, ...shadow.card },
  bigRow: { flexDirection: 'row', gap: 28, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: color.grey1 },
  modalCard: { width: '100%', backgroundColor: color.card, borderRadius: 24, padding: 14, ...shadow.float },
  frame: { aspectRatio: 9 / 13, borderRadius: 16, overflow: 'hidden', backgroundColor: color.ink },
  closeDisc: { position: 'absolute', top: 10, right: 10, width: 34, height: 34, borderRadius: 999, backgroundColor: editor.k50, alignItems: 'center', justifyContent: 'center' },
});
