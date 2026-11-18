// Creators pane (ANALYTICS.md 1b): flat ranked rows, views at right, most
// viewed first. Only the list scrolls.
import { useRef, type ReactElement } from 'react';
import { ScrollView, StyleSheet, Text, View, type RefreshControlProps, type ScrollViewInstance } from 'react-native';
import { useScrollToTop } from 'expo-router';

import { credit, signupsLabel, fmt, sales } from '../../../../lib/v2-format';
import type { V2Creator } from '../../../../lib/v2-posts';
import { color, text } from '../../../../theme/v2';
import { Avatar, Icon, Press } from '../../../v2';
import { CreatorsButton } from './CreatorsButton';

export function CreatorsPane({ creators, onCreator, onManage, stripeConnected = false, bottomInset, refreshControl }: { /** Stripe is linked: rows show each creator's code and the sales on it. */ stripeConnected?: boolean; creators: V2Creator[]; onCreator: (id: string) => void; /** Pushes the roster, where Invite lives. */ onManage?: () => void; bottomInset: number; refreshControl?: ReactElement<RefreshControlProps> }) {
  const ranked = creators.slice().sort((a, b) => b.views - a.views);
  const ref = useRef<ScrollViewInstance>(null);
  useScrollToTop(ref);
  return (
    <ScrollView ref={ref} refreshControl={refreshControl} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomInset + 24 }}>
      {onManage ? (
        <View style={{ paddingTop: 2, paddingBottom: 8 }}>
          <CreatorsButton creators={creators} onPress={onManage} />
        </View>
      ) : null}
      {ranked.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 32, gap: 6 }}>
          <Text style={text.row}>No creators yet</Text>
          <Text style={[text.body, { color: color.grey4, textAlign: 'center' }]}>Invite creators above. Once they join and post, they rank here by views.</Text>
        </View>
      ) : null}
      {ranked.map((c, i) => (
        <Press key={c.id} accessibilityRole="button" onPress={() => onCreator(c.id)} style={[styles.row, i ? styles.line : null]}>
          <Text style={[styles.rank, { color: i === 0 ? color.blue : color.grey3 }]}>{i + 1}</Text>
          <Avatar name={c.name} photo={c.photo} tone={c.tone} size={40} ring={false} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 20, fontWeight: '700', color: color.ink }}>
              {c.name}
            </Text>
            <Text numberOfLines={1} style={text.meta}>
              {c.posts} {c.posts === 1 ? 'post' : 'posts'}
              {stripeConnected ? ` · ${c.code ?? 'no code yet'}` : ''}
            </Text>
            {stripeConnected && (c.salesCents > 0 || c.signups > 0) ? (
              <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: color.green }}>
                {[c.salesCents > 0 ? `${sales(c.salesCents)} sales` : null, c.signups > 0 ? signupsLabel(c.signups) : null].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 1 }}>
            <Text style={{ fontSize: 16, lineHeight: 20, fontWeight: '700', letterSpacing: -0.2, color: color.ink }}>{fmt(c.views)}</Text>
            <Text style={{ fontSize: 12, lineHeight: 14, fontWeight: '500', color: color.grey4 }}>views</Text>
          </View>
          <Icon name="chevron_right" size={20} color={color.grey3} />
        </Press>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 2 },
  line: { borderTopWidth: 1, borderTopColor: color.grey2 },
  rank: { width: 16, textAlign: 'center', fontSize: 13, lineHeight: 16, fontWeight: '700' },
});
