import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import type { Brief } from '../../../../lib/brief-library';
import { fmt, postDate } from '../../../../lib/v2-format';
import { creatorFor, postsForBrief, useV2Data, type V2Post } from '../../../../lib/v2-posts';
import { color, radius } from '../../../../theme/v2';
import { Avatar, Icon, Label, Press } from '../../../v2';
import { PostFrame } from './PostFrame';

/** State line under the creator: "Live · Oct 21", "In review", or the state. */
export function postStateLine(p: V2Post): string {
  if (p.state === 'Posted') return `Live · ${postDate(p.date)}`;
  if (p.state === 'Waiting') return 'In review';
  return p.state;
}

/** Posts made from one brief: two figures, a quiet sort, flat rows. */
export function BriefPostsPanel({ brief, onOpen }: { brief: Brief; onOpen: (p: V2Post) => void }) {
  const posts = useV2Data((s) => s.posts);
  const creators = useV2Data((s) => s.creators);
  const [sort, setSort] = useState<'views' | 'new'>('views');
  const list = postsForBrief(posts, brief).sort((a, b) => (sort === 'new' ? b.date.getTime() - a.date.getTime() : b.views - a.views));
  const live = list.filter((p) => p.state === 'Posted');
  const tv = live.reduce((a, p) => a + p.views, 0);
  if (!list.length) {
    return (
      <View style={{ paddingVertical: 48, paddingHorizontal: 20, alignItems: 'center' }}>
        <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: color.grey4 }}>No posts yet</Text>
      </View>
    );
  }
  const big = (v: string, l: string) => (
    <View style={{ gap: 2 }}>
      <Text style={{ fontSize: 30, lineHeight: 34, fontWeight: '800', letterSpacing: -0.8, color: color.ink, fontVariant: ['tabular-nums'] }}>{v}</Text>
      <Text style={{ fontSize: 13, lineHeight: 16, fontWeight: '600', color: color.grey4 }}>{l}</Text>
    </View>
  );
  return (
    <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 12, paddingHorizontal: 20, paddingBottom: 24 }}>
      <View style={{ flexDirection: 'row', gap: 28, paddingHorizontal: 2, paddingBottom: 18 }}>
        {big(String(list.length), list.length === 1 ? 'post' : 'posts')}
        {big(fmt(tv), 'views')}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, paddingBottom: 6 }}>
        <Label>Posts</Label>
        <View style={{ flexDirection: 'row', gap: 14 }}>
          {(
            [
              ['views', 'Views'],
              ['new', 'Newest'],
            ] as const
          ).map(([k, l]) => (
            <Press key={k} onPress={() => setSort(k)} accessibilityRole="button" accessibilityState={{ selected: sort === k }}>
              <Text style={{ fontSize: 13, lineHeight: 20, fontWeight: sort === k ? '700' : '600', color: sort === k ? color.blueDeep : color.grey3 }}>{l}</Text>
            </Press>
          ))}
        </View>
      </View>
      {list.map((p, i) => {
        const c = creatorFor(creators, p);
        const posted = p.state === 'Posted';
        return (
          <Press key={p.id} onPress={() => onOpen(p)} accessibilityRole="button" style={{ flexDirection: 'row', gap: 14, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 2, borderTopWidth: i ? 1 : 0, borderTopColor: color.grey2 }}>
            <PostFrame post={p} width={44} height={68} radius={10} />
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Avatar name={c.name} photo={c.photo} tone={c.tone} size={22} ring={false} />
                <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 20, fontWeight: '700', color: color.ink, flexShrink: 1 }}>
                  {c.name}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 7, height: 7, borderRadius: radius.pill, backgroundColor: posted ? color.green : color.amber }} />
                <Text style={{ fontSize: 13, lineHeight: 18, fontWeight: '500', color: color.grey4 }}>{postStateLine(p)}</Text>
              </View>
            </View>
            {posted ? (
              <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.2, color: color.ink, fontVariant: ['tabular-nums'] }}>
                {fmt(p.views)}
                <Text style={{ fontSize: 12, fontWeight: '500', color: color.grey4 }}> views</Text>
              </Text>
            ) : null}
            <Icon name="chevron_right" size={20} color={color.grey3} />
          </Press>
        );
      })}
    </ScrollView>
  );
}
