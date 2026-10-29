import type { ReactNode } from 'react';
import { Linking, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { fmt, postDate } from '../../../../lib/v2-format';
import { creatorFor, platformStats, useV2Data, type V2Post } from '../../../../lib/v2-posts';
import { color, num, radius, text } from '../../../../theme/v2';
import { Card, Chip, Icon, InstagramMark, Press, Screen, TikTokMark, tap } from '../../../v2';
import { PostFrame } from './PostFrame';

/** Links for a post: its own URL on the platform it was posted to, else the creator's profile. */
export function postLinks(p: V2Post, handle: string | null): { tiktok: string; instagram: string } {
  const h = (handle || '').replace(/^@/, '');
  const own = p.postUrl || '';
  return {
    tiktok: /tiktok\.com/.test(own) ? own : `https://www.tiktok.com/@${h}`,
    instagram: /instagram\.com/.test(own) ? own : `https://www.instagram.com/${h}`,
  };
}

/** One post made from a brief: frame card, platform links, three stats, open-on-platform footer. */
export function BriefPostScreen({ id }: { id: string }) {
  const posts = useV2Data((s) => s.posts);
  const creators = useV2Data((s) => s.creators);
  const p = posts.find((x) => x.id === id);
  if (!p) return <Screen back title="Post" />;
  const c = creatorFor(creators, p);
  const posted = p.state === 'Posted';
  const links = postLinks(p, c.handle);
  const open = (url: string) => {
    tap();
    void Linking.openURL(url).catch(() => undefined);
  };
  const all = platformStats(p, 'all');
  const stat = (v: string, l: string) => (
    <View style={{ flex: 1 }}>
      <Text style={num.lg}>{v}</Text>
      <Text style={text.meta}>{l}</Text>
    </View>
  );
  const platBtn = (name: string, url: string, mark: ReactNode, ink: boolean) => (
    <Press onPress={() => open(url)} accessibilityRole="link" style={{ flex: 1, height: 56, borderRadius: 18, overflow: 'hidden', backgroundColor: ink ? color.ink : 'transparent', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 16px rgba(16,24,40,0.14)' }}>
      {ink ? null : (
        <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 1 1" style={{ position: 'absolute', top: 0, left: 0 }}>
          <Defs>
            <LinearGradient id="igbtn" x1={0} y1={0} x2={1} y2={1}>
              <Stop offset="0" stopColor="#F58529" />
              <Stop offset="0.55" stopColor="#DD2A7B" />
              <Stop offset="1" stopColor="#8134AF" />
            </LinearGradient>
          </Defs>
          <Rect width={1} height={1} fill="url(#igbtn)" />
        </Svg>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {mark}
        <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: color.white }}>{name}</Text>
      </View>
    </Press>
  );
  return (
    <Screen
      back
      title={c.name}
      scroll
      footer={
        posted ? (
          <View style={{ flex: 1, flexDirection: 'row', gap: 10 }}>
            {platBtn('Open on TikTok', links.tiktok, <TikTokMark size={18} />, true)}
            {platBtn('Open on Instagram', links.instagram, <InstagramMark size={18} strokeWidth={2} />, false)}
          </View>
        ) : undefined
      }
    >
      <Card pad={0} style={{ overflow: 'hidden' }}>
        <View style={{ aspectRatio: 9 / 11 }}>
          <PostFrame post={p} width="100%" height={0} radius={0} style={{ height: '100%' }} />
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 120 }}>
            <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 1 1">
              <Defs>
                <LinearGradient id="scrim" x1={0} y1={1} x2={0} y2={0}>
                  <Stop offset="0" stopColor="#000000" stopOpacity={0.7} />
                  <Stop offset="1" stopColor="#000000" stopOpacity={0} />
                </LinearGradient>
              </Defs>
              <Rect width={1} height={1} fill="url(#scrim)" />
            </Svg>
          </View>
          <View style={{ position: 'absolute', left: 16, right: 16, bottom: 14 }}>
            <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '700', color: color.white }}>{p.title}</Text>
            <Text style={{ marginTop: 4, fontSize: 13, lineHeight: 16, fontWeight: '500', color: 'rgba(255,255,255,0.8)' }}>
              {c.handle ? `${c.handle} · ` : ''}
              {p.format}
              {posted ? ` · ${postDate(p.date)}` : ''}
            </Text>
          </View>
          <View style={{ position: 'absolute', right: 12, top: 12 }}>
            <Chip tone={posted ? 'green' : 'amber'} label={posted ? 'Live' : p.state === 'Waiting' ? 'In review' : p.state} />
          </View>
        </View>
      </Card>
      {posted ? (
        <>
          <Card pad={0}>
            {(
              [
                ['TikTok', links.tiktok],
                ['Instagram', links.instagram],
              ] as const
            ).map(([n, u], i) => (
              <Press key={n} onPress={() => open(u)} accessibilityRole="link" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: i ? 1 : 0, borderTopColor: color.grey2 }}>
                <Icon name="link" size={20} color={color.blue} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '700', color: color.ink }}>{n}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: '500', color: color.grey4 }}>
                    {u.replace('https://www.', '')}
                  </Text>
                </View>
                <Icon name="open_in_new" size={18} color={color.grey3} />
              </Press>
            ))}
          </Card>
          <Card style={{ flexDirection: 'row', gap: 12 }}>
            {stat(fmt(all.views), 'views')}
            {stat(fmt(all.likes), 'likes')}
            {stat(fmt(all.saves), 'saves')}
          </Card>
        </>
      ) : (
        <Card>
          <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: color.grey4 }}>Waiting for review. Stats appear once it is live.</Text>
        </Card>
      )}
      <View style={{ height: radius.card }} />
    </Screen>
  );
}
