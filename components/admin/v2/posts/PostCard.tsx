// The post card shared by Analytics > Posts and the creator profile
// (ANALYTICS.md 1c and 3): white r18, padding 12, a 52x70 frame, the title on
// two lines, a meta line and the views at right for live posts.
import { StyleSheet, Text, View } from 'react-native';

import { fmt, shortDate } from '../../../../lib/v2-format';
import type { V2Creator, V2Post } from '../../../../lib/v2-posts';
import { color, shadow } from '../../../../theme/v2';
import { Avatar, Icon, InstagramMark, Press, TikTokMark } from '../../../v2';
import { PostFrame } from './PostFrame';

/** TikTok and Instagram marks in grey-4 at 12px, for meta lines. */
export function Marks() {
  return (
    <>
      <TikTokMark size={12} color={color.grey4} />
      <InstagramMark size={12} color={color.grey4} strokeWidth={2.4} />
    </>
  );
}

/** Views figure over the word "views", right aligned. */
export function Views({ n, size = 17 }: { n: number; size?: number }) {
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <Text style={{ fontSize: size, lineHeight: size + 5, fontWeight: '700', letterSpacing: -0.2, color: color.ink }}>{fmt(n)}</Text>
      <Text style={{ fontSize: 12, lineHeight: 14, fontWeight: '500', color: color.grey4 }}>views</Text>
    </View>
  );
}

/** "In review", "Changes requested" or "Not posted yet" for a post that is not live. */
export function stateLabel(p: Pick<V2Post, 'state'>): string {
  return p.state === 'Waiting' ? 'In review' : p.state === 'Changes requested' ? 'Changes requested' : 'Not posted yet';
}

export interface PostCardProps {
  p: V2Post;
  /** Shown as a 16px avatar and name before the marks (Analytics > Posts). */
  creator?: V2Creator;
  onPress: () => void;
}

export function PostCard({ p, creator, onPress }: PostCardProps) {
  const live = p.state === 'Posted';
  return (
    <Press accessibilityRole="button" onPress={onPress} style={styles.card}>
      <PostFrame post={p} width={52} height={70} radius={12} />
      <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
        <Text numberOfLines={2} style={styles.title}>
          {p.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {creator ? (
            <>
              <Avatar name={creator.name} photo={creator.photo} tone={creator.tone} size={16} ring={false} />
              <Text numberOfLines={1} style={[styles.meta, { flexShrink: 1 }]}>
                {creator.name}
              </Text>
              <Text style={styles.meta}>{'·'}</Text>
            </>
          ) : null}
          {live ? (
            <>
              <Marks />
              <Text style={styles.meta}>{shortDate(p.date)}</Text>
            </>
          ) : (
            <Text style={styles.meta}>{stateLabel(p)}</Text>
          )}
        </View>
      </View>
      {live ? <Views n={p.views} /> : null}
      <Icon name="chevron_right" size={20} color={color.grey3} />
    </Press>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: 18, backgroundColor: color.card, ...shadow.card },
  title: { fontSize: 15, lineHeight: 19, fontWeight: '700', color: color.ink },
  meta: { fontSize: 13, lineHeight: 18, fontWeight: '500', color: color.grey4 },
});
